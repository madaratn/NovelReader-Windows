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
//  - direct file -> <dir>/<part>/video.<ext>
//  - HLS         -> every segment / key / init section of the best variant (and its
//                   audio renditions) next to a rewritten local playlist.
// One download at a time; finished ones are served by the engine (DownloadRoutes).
//
// A download that is cut does not start over. Each stream is saved in its own part
// (<dir>/p<hash of where it comes from>): a direct file goes on from the byte it
// stopped at (Range), an HLS stream keeps the segments it has. The part stays when
// every stream failed or the app was closed, and the next try (the interface asks
// again, with fresh links) goes on from it; a part nobody came back to is deleted
// after a week.

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

class VideoDownloads(
    val root: File, private val client: OkHttpClient,
    private val retryMs: Long = 600, private val patienceMs: Long = 90_000,
    private val onActive: (Boolean) -> Unit = {},
) {
    private class Job(var meta: DlItem, val candidates: List<DlCandidate>) {
        @Volatile var state = "queued"
        @Volatile var progress = 0.0
        @Volatile var bytes = 0L
        @Volatile var error = ""
        /** Cancelled by the user. */
        @Volatile var aborted = false
        /** The stream being saved failed: what it still has under way stops. */
        @Volatile var stopped = false
        var base = 0.0
        /** Requests under way, so that cancelling does not wait for the network. */
        val calls: MutableSet<okhttp3.Call> = ConcurrentHashMap.newKeySet()
        fun over() = aborted || stopped
        fun hangUp() { for (c in calls) try { c.cancel() } catch (e: Exception) {} }
    }
    private class Tries { var fails = 0; var since = 0L }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val jobs = ConcurrentHashMap<String, Job>()
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "nr-downloads").apply { isDaemon = true } }
    private val segments = Executors.newFixedThreadPool(4) { r -> Thread(r, "nr-download-segment").apply { isDaemon = true } }
    private val pending = AtomicInteger(0)
    @Volatile var settings = DlSettings()
    /** Bumped at every change: the interface polls it instead of listing all the time. */
    @Volatile var version = 0L
        private set

    init {
        root.mkdirs()
        // Left by an earlier run: a folder that holds neither a finished download nor a
        // part to go on from is deleted, and so is a part nobody came back to for a week.
        try {
            for (d in root.listFiles() ?: emptyArray()) {
                // Only folders named like a download: what somebody put there by hand is not ours to delete.
                if (!d.isDirectory || !OURS.matches(d.name)) continue
                // (A meta.json, even one that cannot be read: never delete what may be a whole video.)
                if (metaFile(d.name).exists()) continue
                val parts = d.listFiles { f -> f.isDirectory && isPart(f.name) && hasData(f) }
                if (parts.isNullOrEmpty() || System.currentTimeMillis() - newest(d) > WEEK) d.deleteRecursively()
            }
        } catch (e: Exception) { println("[downloads] cleanup skipped: ${e.message}") }
    }

    private fun changed() { version++ }
    private fun dirSize(d: File): Long = d.listFiles()?.sumOf { if (it.isDirectory) dirSize(it) else it.length() } ?: 0
    private fun newest(d: File): Long = maxOf(d.lastModified(), d.listFiles()?.maxOfOrNull { if (it.isDirectory) newest(it) else it.lastModified() } ?: 0L)
    /** Something of a stream is saved in this part (the notes for going on and the playlists do not count). */
    private fun hasData(d: File) = d.listFiles()?.any { it.isFile && it.length() > 0 && !it.name.endsWith("resume.json") && !it.name.endsWith(".part") && !it.name.endsWith(".m3u8") } ?: false
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

        private const val WEEK = 7L * 24 * 3600 * 1000
        private val OURS = Regex("^(anime|series|movie)_.*_[0-9a-f]{10}$")
        fun sha(s: String): String = MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
        // Query fields that change at every visit (signatures, expiry dates): left out when
        // two links are compared to know whether they lead to the same file.
        private val VOLATILE = Regex("^(t|ts|time|e|exp|expires?|expiry|s|sig|sign|signature|st|token|tok|auth|hash|md5|hmac|verify|nonce|session|sid|ip|policy|key-pair-id|hdnea|hdnts|hdntl|wmsauthsign|validfrom|validto|x-amz-.*|x-goog-.*)$", RegexOption.IGNORE_CASE)
        private fun dec(s: String) = try { java.net.URLDecoder.decode(s, "UTF-8") } catch (e: Exception) { s }
        private fun pathAndQuery(x: String): Pair<String, List<Pair<String, String>>> {
            val plain = x.substringBefore('#')
            val path = plain.substringBefore('?').replace(Regex("^[A-Za-z][A-Za-z0-9+.-]*://[^/]*"), "")
            val query = plain.substringAfter('?', "").split('&').filter { it.isNotEmpty() }.map { dec(it.substringBefore('=')) to dec(it.substringAfter('=', "")) }
            return path to query
        }
        /**
         * Where a stream really comes from: the path on its own server (engine links carry
         * it in ?url=), without the server name (they rotate) and without the fields above.
         */
        fun pathOf(u: String): String {
            var (path, query) = pathAndQuery(u)
            val up = query.firstOrNull { it.first == "url" }?.second
            if (up != null && Regex("^https?:", RegexOption.IGNORE_CASE).containsMatchIn(up)) { val p = pathAndQuery(up); path = p.first; query = p.second }
            val rest = query.filter { !VOLATILE.matches(it.first) }.map { it.first + "=" + it.second }.sorted().joinToString("&")
            return if (rest.isEmpty()) path else "$path?$rest"
        }
        /** One stream of a download is saved in its own part of the folder, named after where it comes from. */
        fun partOf(c: DlCandidate) = "p" + sha((if (c.type == "hls") "hls" else "file") + "|" + pathOf(c.url)).take(10)
        fun isPart(name: String) = Regex("^p[0-9a-f]{10}$").matches(name)
        fun contentType(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
            "m3u8" -> "application/vnd.apple.mpegurl"; "ts" -> "video/mp2t"; "m4s" -> "video/iso.segment"; "mp4" -> "video/mp4"
            "m4a" -> "audio/mp4"; "aac" -> "audio/aac"; "vtt" -> "text/vtt"; "srt", "ass" -> "text/plain"
            "webm" -> "video/webm"; "mkv" -> "video/x-matroska"; else -> "application/octet-stream"
        }
    }

    // ---- network ---------------------------------------------------------------
    /** The server said no: asking again would get the same answer. */
    private fun fatal(e: Throwable): Boolean {
        val st = (e as? DlError)?.status ?: 0
        return (st in 400..499 && st != 408 && st != 429) || noSpace(e)
    }
    private fun noSpace(e: Throwable) = e is java.io.IOException && Regex("ENOSPC|No space left", RegexOption.IGNORE_CASE).containsMatchIn(e.message ?: "")

    private fun pause(ms: Long, job: Job) {
        var left = ms
        while (left > 0) { if (job.over()) throw DlError("aborted"); val step = minOf(left, 100L); Thread.sleep(step); left -= step }
    }

    /**
     * After a failure: stop at once when the server said no or the download was cancelled;
     * after a few quick tries while nothing is saved yet (a dead server must give way to
     * the next one fast); after [patienceMs] once the download is under way, so that a
     * short cut of the connection does not throw away what is saved.
     */
    private fun waitOrGiveUp(e: Exception, st: Tries, job: Job, patient: Boolean, quick: Int) {
        if (job.over() || fatal(e)) throw e
        if (st.since == 0L) st.since = System.currentTimeMillis()
        if (if (patient && job.bytes > 0) System.currentTimeMillis() - st.since >= patienceMs else st.fails >= quick) throw e
        pause(minOf(15000L, retryMs shl minOf(st.fails, 5)), job)
        st.fails++
    }

    /** One request (a silent connection is dropped by the read timeout of the client). */
    private fun <T> request(url: String, job: Job, range: String? = null, block: (okhttp3.Response) -> T): T {
        if (job.over()) throw DlError("aborted")
        val rb = Request.Builder().url(url)
        if (range != null) rb.header("Range", range)
        val call = client.newCall(rb.build())
        job.calls.add(call)
        try { return call.execute().use(block) } finally { job.calls.remove(call) }
    }

    /** A small resource kept in memory (playlist, key, segment, subtitle). */
    private fun getBytes(url: String, job: Job, text: Boolean = false, patient: Boolean = true): ByteArray {
        val st = Tries()
        while (true) {
            try {
                return request(url, job) { r ->
                    if (!r.isSuccessful) throw DlError("HTTP " + r.code, r.code)
                    r.body.bytes()
                }
            } catch (e: Exception) { waitOrGiveUp(e, st, job, patient, if (text) 1 else 3) }
        }
    }

    private fun throttle(n: Int) {
        val limit = settings.limit
        if (limit > 0) Thread.sleep(minOf(30000L, n * 1000L / limit))
    }

    /**
     * A direct file, written as it arrives. When the connection drops or goes silent the
     * file goes on from the byte it stopped at (Range) instead of starting over; the same
     * on a later try, as long as the file still has the same length.
     */
    private fun saveStream(url: String, file: File, job: Job) {
        val mark = File(file.path + ".resume.json")
        var total = try { Regex("\"total\":(\\d+)").find(mark.readText())?.groupValues?.get(1)?.toLong() ?: 0L } catch (e: Exception) { 0L }
        var got = if (total > 0 && file.isFile) file.length() else 0L
        if (total <= 0 || got > total) { got = 0; total = 0 }
        val st = Tries()
        var tick = 0L
        fun report() {
            job.bytes = got
            job.progress = if (total > 0) minOf(0.99, got.toDouble() / total) else 0.0
            val now = System.currentTimeMillis()
            if (now - tick > 500) { tick = now; changed() }
        }
        if (got > 0) report()
        while (total == 0L || got < total) {
            try {
                val again = request(url, job, if (got > 0) "bytes=$got-" else null) { r ->
                    if (got > 0 && r.code == 416) { got = 0; total = 0; return@request true }
                    if (!r.isSuccessful) throw DlError("HTTP " + r.code, r.code)
                    if (got > 0) {
                        val m = Regex("bytes\\s+(\\d+)-\\d*/(\\d+|\\*)", RegexOption.IGNORE_CASE).find(r.header("Content-Range") ?: "")
                        if (r.code != 206) { got = 0; total = 0 } // the whole file is sent again: taken from the start
                        else if (m == null || m.groupValues[1].toLong() != got || (total > 0 && m.groupValues[2] != "*" && m.groupValues[2].toLong() != total)) {
                            got = 0; total = 0; return@request true // not the same file any more
                        } else if (total == 0L && m.groupValues[2] != "*") total = m.groupValues[2].toLong()
                    }
                    if (got == 0L) {
                        total = maxOf(0L, r.body.contentLength())
                        if (total > 0) mark.writeText("{\"total\":$total}") else mark.delete()
                    }
                    java.io.FileOutputStream(file, got > 0).use { out ->
                        val input = r.body.byteStream()
                        val buf = ByteArray(128 * 1024)
                        while (true) {
                            if (job.over()) throw DlError("aborted")
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            got += n
                            st.fails = 0; st.since = 0
                            report()
                            throttle(n)
                        }
                    }
                    false
                }
                if (again) continue
                if (total == 0L) break // length not given: the end of the answer is the end of the file
                if (got < total) throw DlError("The connection was cut")
            } catch (e: Exception) { waitOrGiveUp(e, st, job, true, 3) }
        }
        if (got == 0L) throw DlError("Empty file")
    }

    // ---- HLS ---------------------------------------------------------------------
    /** Downloads one media playlist into dir/<prefix>…; returns the local playlist name. */
    private fun mediaPlaylist(url: String, dir: File, prefix: String, job: Job, weight: Double): String {
        val text = String(getBytes(url, job, true))
        val out = ArrayList<String>()
        val files = LinkedHashMap<String, String>()
        val fixedNames = HashSet<String>()
        fun local(uri: String, ext: String, fixed: Boolean): String {
            val name = files.getOrPut(resolve(url, uri)) { prefix + files.size + ext }
            if (fixed) fixedNames.add(name)
            return name
        }
        for (line in text.split(Regex("\r?\n"))) {
            if (Regex("^#EXT-X-(KEY|MAP|SESSION-KEY):").containsMatchIn(line) && line.contains("URI=\"")) {
                val name = local(attr(line, "URI"), if (line.startsWith("#EXT-X-MAP")) ".mp4" else ".key", true)
                out.add(line.replace(Regex("URI=\"[^\"]*\""), "URI=\"$name\""))
            } else if (line.isNotEmpty() && !line.startsWith("#")) {
                out.add(local(line.trim(), extOf(line.trim(), url, ".ts"), false))
            } else out.add(line)
        }
        if (files.isEmpty()) throw DlError("Empty playlist")
        // What an earlier try saved is kept when this is the same list of files in the same
        // order (the links may carry new tokens). Anything else starts this list over.
        val mark = File(dir, prefix + "resume.json")
        val sig = sha(files.keys.joinToString("\n") { pathOf(it) })
        fun mine(): List<File> = dir.listFiles { f -> f.name.startsWith(prefix) && f.name.drop(prefix.length).firstOrNull()?.isDigit() == true }?.toList() ?: emptyList()
        var keep = try { mark.readText().contains("\"$sig\"") } catch (e: Exception) { false }
        fun wipe() { for (f in mine()) f.delete(); keep = false }
        if (!keep) wipe() else for (f in mine()) if (f.name.endsWith(".part")) f.delete()
        mark.writeText("{\"sig\":\"$sig\"}")
        // A file is complete or absent: written under another name, then given its own.
        fun save(name: String, buf: ByteArray) {
            val part = File(dir, "$name.part")
            val f = File(dir, name)
            part.writeBytes(buf)
            if (!part.renameTo(f)) { f.delete(); if (!part.renameTo(f)) throw java.io.IOException("Could not save $name") }
        }
        // Keys and init sections are small and always fetched again: with another key, the
        // segments already here could not be read.
        val fixed = files.entries.filter { it.value in fixedNames }.map { it.value to getBytes(it.key, job) }
        if (keep && fixed.any { (name, buf) -> val f = File(dir, name); !f.isFile || !f.readBytes().contentEquals(buf) }) wipe()
        for ((name, buf) in fixed) save(name, buf)
        val done = AtomicInteger(fixed.size)
        val total = files.size
        val base = job.base
        fun step() { job.progress = minOf(0.99, base + weight * done.get() / total); changed() }
        val todo = ArrayList<Pair<String, String>>()
        for ((abs, name) in files) {
            if (name in fixedNames) continue
            val size = if (keep) File(dir, name).length() else 0L
            if (size > 0) { done.incrementAndGet(); synchronized(job) { job.bytes += size } } else todo.add(abs to name)
        }
        step()
        // Four at a time. The first failure stops the others: they used to go on to the
        // end of the list before the next stream could be tried.
        val failure = java.util.concurrent.atomic.AtomicReference<Throwable?>(null)
        val futures = todo.map { (abs, name) ->
            segments.submit(Runnable {
                if (job.over()) return@Runnable
                try {
                    val buf = getBytes(abs, job)
                    if (job.over()) return@Runnable
                    save(name, buf)
                    synchronized(job) { job.bytes += buf.size }
                    done.incrementAndGet()
                    step()
                    throttle(buf.size)
                } catch (e: Throwable) {
                    if (failure.compareAndSet(null, e)) { job.stopped = true; job.hangUp() }
                }
            })
        }
        for (f in futures) try { f.get() } catch (e: Exception) { failure.compareAndSet(null, e) }
        failure.get()?.let { throw it }
        if (job.over()) throw DlError("aborted")
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
        dir.mkdirs()
        // Parts of streams that are not offered any more cannot be gone on from.
        val wanted = job.candidates.map { partOf(it) }.toSet()
        for (f in dir.listFiles() ?: emptyArray()) if (f.name !in wanted) f.deleteRecursively()
        val errors = ArrayList<String>()
        for (c in job.candidates) {
            if (job.aborted) break
            val part = partOf(c)
            val pdir = File(dir, part)
            job.stopped = false
            try {
                pdir.mkdirs()
                job.base = 0.0; job.bytes = 0; job.progress = 0.0
                val file: String
                if (c.type == "hls") file = downloadHls(c.url, pdir, job)
                else {
                    val em = Regex("\\.(mkv|webm)(\\?|&|$)", RegexOption.IGNORE_CASE).find(try { java.net.URLDecoder.decode(c.url, "UTF-8") } catch (e: Exception) { c.url })
                    file = "video." + (em?.groupValues?.get(1)?.lowercase() ?: "mp4")
                    saveStream(c.url, File(pdir, file), job)
                }
                val subs = ArrayList<DlSavedSub>()
                for (s in c.subtitles.take(8)) try {
                    val buf = getBytes(s.url, job, patient = false)
                    val head = String(buf, 0, minOf(buf.size, 20))
                    val ext = if (head.trimStart().startsWith("WEBVTT")) ".vtt" else if (Regex("\\.ass(\\?|$)", RegexOption.IGNORE_CASE).containsMatchIn(s.url)) ".ass" else ".srt"
                    val name = "sub" + subs.size + ext
                    File(pdir, name).writeBytes(buf)
                    subs.add(DlSavedSub(s.label, s.lang, "$part/$name"))
                } catch (e: Exception) { if (job.aborted) throw e }
                // Done: the parts of the other streams and the notes for going on are not needed any more.
                for (f in dir.listFiles() ?: emptyArray()) if (f.name != part) f.deleteRecursively()
                for (f in pdir.listFiles() ?: emptyArray()) if (f.name.endsWith("resume.json") || f.name.endsWith(".part")) f.delete()
                val done = job.meta.copy(state = "done", progress = 1.0, type = if (c.type == "hls") "hls" else "file", file = "$part/$file", title = c.title, subtitles = subs, size = dirSize(dir), finishedAt = System.currentTimeMillis(), bytes = 0, error = "")
                metaFile(done.id).writeText(json.encodeToString(done))
                job.meta = done; job.state = "done"; job.progress = 1.0
                return
            } catch (e: Throwable) {
                if (job.aborted) break
                val full = noSpace(e)
                errors.add(if (full) "No space left on the disk" else (e.message ?: e.toString()))
                println("[downloads] candidate failed: ${c.title}: ${e.message}")
                // What was saved stays for the next try; a part with nothing in it goes.
                if (!hasData(pdir)) pdir.deleteRecursively()
                if (full) break
            }
        }
        // Cancelled: nothing is kept. (Unless the same episode was asked for again meanwhile:
        // the folder and the place in the list are its own now.)
        if (job.aborted) {
            val now = jobs[job.meta.id]
            if (now == null || now === job) { dir.deleteRecursively(); jobs.remove(job.meta.id, job) }
            return
        }
        if (dir.listFiles().isNullOrEmpty()) dir.delete()
        job.state = "error"; job.error = errors.lastOrNull() ?: "No downloadable stream"
    }

    fun start(p: DlStart): DlId {
        if (p.mediaId.isEmpty() || p.episodeUrl.isEmpty()) throw DlError("Missing episode")
        val candidates = p.candidates.filter { Regex("^http://127\\.0\\.0\\.1:\\d+/").containsMatchIn(it.url) }
            .map { it.copy(type = if (it.type == "hls") "hls" else "file") }
        if (candidates.isEmpty()) throw DlError("This episode has no stream that can be downloaded.")
        val id = idFor(p.kind, p.mediaId, p.episodeUrl)
        val cur = jobs[id]
        if (cur != null && !cur.aborted && (cur.state == "queued" || cur.state == "downloading")) return DlId(id)
        val meta = DlItem(id = id, kind = p.kind, mediaId = p.mediaId, mediaName = p.mediaName, cover = p.cover, episodeUrl = p.episodeUrl, episodeName = p.episodeName, episodeNo = p.episodeNo, mediaKey = p.mediaKey, createdAt = System.currentTimeMillis())
        val job = Job(meta, candidates)
        jobs[id] = job
        if (pending.incrementAndGet() == 1) onActive(true)
        changed()
        worker.execute {
            try {
                if (!job.aborted && job.state == "queued") { job.state = "downloading"; changed(); runJob(job) }
                else if (job.aborted) jobs.remove(id, job)
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

    /** Cancelling leaves nothing behind (a failed download keeps its part until then). */
    fun cancel(id: String): Boolean {
        val j = jobs[id] ?: return false
        j.aborted = true
        j.hangUp()
        if (j.state == "queued" || j.state == "error") { jobs.remove(id); File(root, id).deleteRecursively() }
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
        for (j in jobs.values) { j.aborted = true; j.hangUp() }
        jobs.clear()
        root.listFiles()?.forEach { if (OURS.matches(it.name)) it.deleteRecursively() }
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
