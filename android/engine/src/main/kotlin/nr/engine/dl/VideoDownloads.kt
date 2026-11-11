package nr.engine.dl

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

// Offline video downloads on Android: the same behaviour and the same answers as
// the PC (electron/video-downloads.cjs), so the interface is shared.
//  - direct file -> <dir>/video.<ext>
//  - HLS         -> every segment / key / init section of the best variant (and its
//                   audio renditions) next to a rewritten local playlist.
// One download at a time; finished ones are served by the engine (DownloadRoutes).

@Serializable data class DlSub(val url: String = "", val label: String = "", val lang: String = "")
@Serializable data class DlCandidate(val url: String = "", val type: String = "file", val title: String = "", val subtitles: List<DlSub> = emptyList())
@Serializable data class DlStart(
    val kind: String = "", val mediaId: String = "", val mediaName: String = "", val cover: String = "",
    val episodeUrl: String = "", val episodeName: String = "", val episodeNo: Double = 0.0, val mediaKey: String = "",
    val candidates: List<DlCandidate> = emptyList(),
)
@Serializable data class DlSavedSub(val label: String = "", val lang: String = "", val file: String = "")
@Serializable data class DlItem(
    val id: String, val kind: String = "", val mediaId: String = "", val mediaName: String = "", val cover: String = "",
    val episodeUrl: String = "", val episodeName: String = "", val episodeNo: Double = 0.0, val mediaKey: String = "",
    val state: String = "queued", val progress: Double = 0.0, val bytes: Long = 0, val size: Long = 0, val error: String = "",
    val type: String = "", val file: String = "", val title: String = "", val subtitles: List<DlSavedSub> = emptyList(),
    val createdAt: Long = 0, val finishedAt: Long = 0,
)
@Serializable data class DlUsage(val bytes: Long, val count: Int, val folder: String)
@Serializable data class DlSettings(val maxHeight: Int = 0, val limit: Long = 0)
@Serializable data class DlId(val id: String)

class DlError(message: String, val status: Int = 0) : Exception(message)

class VideoDownloads(val root: File, private val client: OkHttpClient, private val onActive: (Boolean) -> Unit = {}) {
    private class Job(var meta: DlItem, val candidates: List<DlCandidate>) {
        @Volatile var state = "queued"
        @Volatile var progress = 0.0
        @Volatile var bytes = 0L
        @Volatile var error = ""
        @Volatile var aborted = false
        var base = 0.0
    }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val jobs = ConcurrentHashMap<String, Job>()
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "nr-downloads").apply { isDaemon = true } }
    private val segments = Executors.newFixedThreadPool(4) { r -> Thread(r, "nr-download-segment").apply { isDaemon = true } }
    private val pending = AtomicInteger(0)
    @Volatile var settings = DlSettings()
    /** Bumped at every change: the interface polls it instead of listing all the time. */
    @Volatile var version = 0L
        private set

    init { root.mkdirs() }

    private fun changed() { version++ }
    private fun dirSize(d: File): Long = d.listFiles()?.sumOf { if (it.isDirectory) dirSize(it) else it.length() } ?: 0
    private fun metaFile(id: String) = File(File(root, id), "meta.json")
    private fun readMeta(id: String): DlItem? = try { json.decodeFromString<DlItem>(metaFile(id).readText()) } catch (e: Exception) { null }

    companion object {
        fun safe(s: String) = s.replace(Regex("[^A-Za-z0-9._-]+"), "_").take(80)
        fun idFor(kind: String, mediaId: String, episodeUrl: String): String {
            val sha = MessageDigest.getInstance("SHA-1").digest("$mediaId|$episodeUrl".toByteArray()).joinToString("") { "%02x".format(it) }
            return safe(kind) + "_" + safe(mediaId).take(40) + "_" + sha.take(10)
        }
        fun attr(line: String, name: String): String {
            val m = Regex("$name=(\"([^\"]*)\"|[^,]*)").find(line) ?: return ""
            return m.groups[2]?.value ?: m.groupValues[1]
        }
        private val EXTS = setOf(".ts", ".m4s", ".mp4", ".m4a", ".aac", ".vtt", ".srt", ".ass", ".key", ".webm", ".mkv")
        fun extOf(uri: String, base: String, def: String): String = try {
            val p = URI(base).resolve(uri).path ?: ""
            val e = p.substringAfterLast('/', "").let { if (it.contains('.')) "." + it.substringAfterLast('.').lowercase() else "" }
            if (e in EXTS) e else def
        } catch (e: Exception) { def }
        fun resolve(base: String, uri: String): String = try { URI(base).resolve(uri).toString() } catch (e: Exception) { uri }
        fun contentType(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
            "m3u8" -> "application/vnd.apple.mpegurl"; "ts" -> "video/mp2t"; "m4s" -> "video/iso.segment"; "mp4" -> "video/mp4"
            "m4a" -> "audio/mp4"; "aac" -> "audio/aac"; "vtt" -> "text/vtt"; "srt", "ass" -> "text/plain"
            "webm" -> "video/webm"; "mkv" -> "video/x-matroska"; else -> "application/octet-stream"
        }
    }

    // ---- network ---------------------------------------------------------------
    private fun getBytes(url: String, job: Job, text: Boolean = false): ByteArray {
        var last: Exception? = null
        for (attempt in 0 until 4) {
            if (job.aborted) throw DlError("aborted")
            try {
                client.newCall(Request.Builder().url(url).build()).execute().use { r ->
                    if (!r.isSuccessful) throw DlError("HTTP " + r.code, r.code)
                    return r.body.bytes()
                }
            } catch (e: Exception) {
                last = e
                val st = (e as? DlError)?.status ?: 0
                if (job.aborted || (st in 400..499 && st != 429) || (text && attempt >= 1)) throw e
                Thread.sleep(600L * (attempt + 1))
            }
        }
        throw last ?: DlError("download failed")
    }

    private fun throttle(n: Int) {
        val limit = settings.limit
        if (limit > 0) Thread.sleep(minOf(30000L, n * 1000L / limit))
    }

    private fun saveStream(url: String, file: File, job: Job) {
        client.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (!r.isSuccessful) throw DlError("HTTP " + r.code, r.code)
            val total = r.body.contentLength()
            var got = 0L
            var tick = 0L
            file.outputStream().use { out ->
                val input = r.body.byteStream()
                val buf = ByteArray(128 * 1024)
                while (true) {
                    if (job.aborted) throw DlError("aborted")
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    got += n
                    job.bytes = got
                    job.progress = if (total > 0) minOf(0.99, got.toDouble() / total) else 0.0
                    val now = System.currentTimeMillis()
                    if (now - tick > 500) { tick = now; changed() }
                    throttle(n)
                }
            }
            if (got == 0L) throw DlError("Empty file")
        }
    }

    // ---- HLS ---------------------------------------------------------------------
    /** Downloads one media playlist into dir/<prefix>…; returns the local playlist name. */
    private fun mediaPlaylist(url: String, dir: File, prefix: String, job: Job, weight: Double): String {
        val text = String(getBytes(url, job, true))
        val out = ArrayList<String>()
        val files = LinkedHashMap<String, String>()
        fun local(uri: String, ext: String): String = files.getOrPut(resolve(url, uri)) { prefix + files.size + ext }
        for (line in text.split(Regex("\r?\n"))) {
            if (Regex("^#EXT-X-(KEY|MAP|SESSION-KEY):").containsMatchIn(line) && line.contains("URI=\"")) {
                val name = local(attr(line, "URI"), if (line.startsWith("#EXT-X-MAP")) ".mp4" else ".key")
                out.add(line.replace(Regex("URI=\"[^\"]*\""), "URI=\"$name\""))
            } else if (line.isNotEmpty() && !line.startsWith("#")) {
                out.add(local(line.trim(), extOf(line.trim(), url, ".ts")))
            } else out.add(line)
        }
        if (files.isEmpty()) throw DlError("Empty playlist")
        val done = AtomicInteger(0)
        val total = files.size
        val base = job.base
        val futures = files.entries.map { (abs, name) ->
            segments.submit {
                val buf = getBytes(abs, job)
                File(dir, name).writeBytes(buf)
                synchronized(job) { job.bytes += buf.size }
                throttle(buf.size)
                job.progress = minOf(0.99, base + weight * done.incrementAndGet() / total)
                changed()
            }
        }
        var failure: Throwable? = null
        for (f in futures) try { f.get() } catch (e: java.util.concurrent.ExecutionException) { if (failure == null) failure = e.cause ?: e }
        failure?.let { throw it }
        job.base += weight
        val name = prefix + "index.m3u8"
        File(dir, name).writeText(out.joinToString("\n"))
        return name
    }

    private class Variant(val inf: String, val uri: String, val bw: Long, val h: Int, val audio: String)

    private fun downloadHls(url: String, dir: File, job: Job): String {
        val text = String(getBytes(url, job, true))
        job.base = 0.0
        if (!text.contains("#EXT-X-STREAM-INF")) return mediaPlaylist(url, dir, "v", job, 1.0)
        // Master playlist: the best variant within the cap (or the smallest above it) and its audio group.
        val lines = text.split(Regex("\r?\n"))
        val variants = ArrayList<Variant>()
        for (i in lines.indices) if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
            val uri = lines.drop(i + 1).firstOrNull { it.isNotEmpty() && !it.startsWith("#") }?.trim() ?: continue
            variants.add(Variant(lines[i], uri, attr(lines[i], "BANDWIDTH").toLongOrNull() ?: 0, attr(lines[i], "RESOLUTION").substringAfter('x', "").toIntOrNull() ?: 0, attr(lines[i], "AUDIO")))
        }
        val cap = if (settings.maxHeight > 0) settings.maxHeight else 1080
        fun fits(v: Variant) = v.h == 0 || v.h <= cap
        val v = variants.sortedWith(Comparator { a, b ->
            val fa = fits(a); val fb = fits(b)
            if (fa != fb) (if (fa) -1 else 1) else if (fa) b.bw.compareTo(a.bw) else a.bw.compareTo(b.bw)
        }).firstOrNull() ?: throw DlError("No variant in playlist")
        val audios = if (v.audio.isEmpty()) emptyList() else lines.filter { it.startsWith("#EXT-X-MEDIA") && it.contains("TYPE=AUDIO") && attr(it, "GROUP-ID") == v.audio && it.contains("URI=\"") }.take(4)
        val weight = 1.0 / (1 + audios.size * 0.25)
        val out = arrayListOf("#EXTM3U", "#EXT-X-VERSION:6")
        val vname = mediaPlaylist(resolve(url, v.uri), dir, "v", job, weight)
        audios.forEachIndexed { i, a ->
            val name = mediaPlaylist(resolve(url, attr(a, "URI")), dir, "a${i}_", job, (1 - weight) / audios.size)
            out.add(a.replace(Regex("URI=\"[^\"]*\""), "URI=\"$name\""))
        }
        out.add(v.inf.replace(Regex(",?(SUBTITLES|CLOSED-CAPTIONS)=(\"[^\"]*\"|[^,]*)"), ""))
        out.add(vname)
        File(dir, "index.m3u8").writeText(out.joinToString("\n"))
        return "index.m3u8"
    }

    // ---- jobs --------------------------------------------------------------------
    private fun runJob(job: Job) {
        val dir = File(root, job.meta.id)
        val errors = ArrayList<String>()
        for (c in job.candidates) {
            if (job.aborted) break
            dir.deleteRecursively(); dir.mkdirs()
            try {
                job.base = 0.0; job.bytes = 0; job.progress = 0.0
                val file: String
                if (c.type == "hls") file = downloadHls(c.url, dir, job)
                else {
                    val em = Regex("\\.(mkv|webm)(\\?|&|$)", RegexOption.IGNORE_CASE).find(try { java.net.URLDecoder.decode(c.url, "UTF-8") } catch (e: Exception) { c.url })
                    file = "video." + (em?.groupValues?.get(1)?.lowercase() ?: "mp4")
                    saveStream(c.url, File(dir, file), job)
                }
                val subs = ArrayList<DlSavedSub>()
                for (s in c.subtitles.take(8)) try {
                    val buf = getBytes(s.url, job)
                    val head = String(buf, 0, minOf(buf.size, 20))
                    val ext = if (head.trimStart().startsWith("WEBVTT")) ".vtt" else if (Regex("\\.ass(\\?|$)", RegexOption.IGNORE_CASE).containsMatchIn(s.url)) ".ass" else ".srt"
                    val name = "sub" + subs.size + ext
                    File(dir, name).writeBytes(buf)
                    subs.add(DlSavedSub(s.label, s.lang, name))
                } catch (e: Exception) { if (job.aborted) throw e }
                val done = job.meta.copy(state = "done", progress = 1.0, type = if (c.type == "hls") "hls" else "file", file = file, title = c.title, subtitles = subs, size = dirSize(dir), finishedAt = System.currentTimeMillis(), bytes = 0, error = "")
                metaFile(done.id).writeText(json.encodeToString(done))
                job.meta = done; job.state = "done"; job.progress = 1.0
                return
            } catch (e: Throwable) {
                if (job.aborted) break
                errors.add(e.message ?: e.toString())
                println("[downloads] candidate failed: ${c.title}: ${e.message}")
            }
        }
        dir.deleteRecursively()
        if (job.aborted) { jobs.remove(job.meta.id); return }
        job.state = "error"; job.error = errors.lastOrNull() ?: "No downloadable stream"
    }

    fun start(p: DlStart): DlId {
        if (p.mediaId.isEmpty() || p.episodeUrl.isEmpty()) throw DlError("Missing episode")
        val candidates = p.candidates.filter { Regex("^http://127\\.0\\.0\\.1:\\d+/").containsMatchIn(it.url) }
            .map { it.copy(type = if (it.type == "hls") "hls" else "file") }
        if (candidates.isEmpty()) throw DlError("This episode has no stream that can be downloaded.")
        val id = idFor(p.kind, p.mediaId, p.episodeUrl)
        val cur = jobs[id]
        if (cur != null && (cur.state == "queued" || cur.state == "downloading")) return DlId(id)
        val meta = DlItem(id = id, kind = p.kind, mediaId = p.mediaId, mediaName = p.mediaName, cover = p.cover, episodeUrl = p.episodeUrl, episodeName = p.episodeName, episodeNo = p.episodeNo, mediaKey = p.mediaKey, createdAt = System.currentTimeMillis())
        val job = Job(meta, candidates)
        jobs[id] = job
        if (pending.incrementAndGet() == 1) onActive(true)
        changed()
        worker.execute {
            try {
                if (!job.aborted && job.state == "queued") { job.state = "downloading"; changed(); runJob(job) }
                else if (job.aborted) jobs.remove(id)
            } catch (e: Throwable) { job.state = "error"; job.error = e.message ?: e.toString() }
            finally { if (pending.decrementAndGet() == 0) onActive(false); changed() }
        }
        return DlId(id)
    }

    fun list(): List<DlItem> {
        val out = ArrayList<DlItem>()
        val seen = HashSet<String>()
        for (j in jobs.values) {
            if (j.state == "done") continue
            seen.add(j.meta.id)
            out.add(j.meta.copy(state = j.state, progress = j.progress, bytes = j.bytes, error = j.error))
        }
        for (d in root.listFiles() ?: emptyArray()) {
            if (!d.isDirectory || d.name in seen) continue
            val m = readMeta(d.name) ?: continue
            if (m.file.isNotEmpty()) out.add(m.copy(state = "done", progress = 1.0))
        }
        return out.sortedByDescending { it.createdAt }
    }

    fun cancel(id: String): Boolean {
        val j = jobs[id] ?: return false
        j.aborted = true
        if (j.state == "queued" || j.state == "error") jobs.remove(id)
        changed()
        return true
    }

    fun remove(id: String): Boolean {
        val sid = safe(id)
        cancel(sid); jobs.remove(sid)
        File(root, sid).deleteRecursively()
        changed()
        return true
    }

    fun clear(): Boolean {
        for (j in jobs.values) j.aborted = true
        jobs.clear()
        root.listFiles()?.forEach { it.deleteRecursively() }
        changed()
        return true
    }

    fun usage() = DlUsage(dirSize(root), list().count { it.state == "done" }, root.absolutePath)

    /** A downloaded file for the player, or null (outside the folder, meta.json, missing). */
    fun fileFor(rel: String): File? {
        val f = File(root, rel).canonicalFile
        if (!f.path.startsWith(root.canonicalPath + File.separator) || f.name == "meta.json" || !f.isFile) return null
        return f
    }
}
