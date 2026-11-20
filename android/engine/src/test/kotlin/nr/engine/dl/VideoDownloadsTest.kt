package nr.engine.dl

import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.ServerSocket
import kotlin.concurrent.thread
import java.nio.file.Files

// Offline videos: a direct file and an HLS stream (master playlist, key, audio)
// are saved and can be played back from the folder; same rules as on the PC.
// A download that is cut goes on from what it had saved.
class VideoDownloadsTest {
    private lateinit var server: ServerSocket
    private lateinit var root: File
    private lateinit var dl: VideoDownloads
    private val hits = java.util.Collections.synchronizedList(ArrayList<String>())
    private val ranges = java.util.Collections.synchronizedList(ArrayList<String>())
    private val active = java.util.Collections.synchronizedList(ArrayList<Boolean>())
    private fun base() = "http://127.0.0.1:${server.localPort}"

    /** One request to the test server: [n] is how many times the path was asked for (1 the first time). */
    private class Req(val path: String, val range: String, val n: Int, val out: java.io.OutputStream, val socket: java.net.Socket) {
        fun head(status: String, length: Int, extra: String = "") = out.write("HTTP/1.1 $status\r\nContent-Length: $length\r\n${extra}Connection: close\r\n\r\n".toByteArray())
        fun text(body: String) { head("200 OK", body.length); out.write(body.toByteArray()) }
        fun status(code: Int) = head("$code Error", 0)
        /** A file served like the engine relay does: whole, or from a byte (Range); [upTo] stops early. */
        fun ranged(body: ByteArray, upTo: Int = body.size, honour: Boolean = true) {
            val from = if (honour) Regex("bytes=(\\d+)-").find(range)?.groupValues?.get(1)?.toInt() ?: -1 else -1
            if (from >= body.size) { head("416 Range Not Satisfiable", 0, "Content-Range: bytes */${body.size}\r\n"); return }
            if (from >= 0) head("206 Partial Content", body.size - from, "Content-Range: bytes $from-${body.size - 1}/${body.size}\r\n") else head("200 OK", body.size)
            val start = maxOf(0, from)
            out.write(body, start, maxOf(0, minOf(upTo, body.size) - start)); out.flush()
        }
    }
    private val routes = java.util.concurrent.ConcurrentHashMap<String, (Req) -> Unit>()
    private val counts = java.util.concurrent.ConcurrentHashMap<String, Int>()
    private val film = ByteArray(4000) { (it % 251).toByte() }
    private fun quick(readMs: Long = 500) = VideoDownloads(root, OkHttpClient.Builder().readTimeout(java.time.Duration.ofMillis(readMs)).build(), retryMs = 10, patienceMs = 1500)

    @Before fun setUp() {
        root = Files.createTempDirectory("nr-dl").toFile()
        val files = mapOf(
            "/movie.mkv" to ByteArray(300_000) { (it % 251).toByte() },
            "/master.m3u8" to ("#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"fr\",URI=\"audio/a.m3u8\"\n" +
                "#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=3840x2160,AUDIO=\"aud\"\nv2160/v.m3u8\n" +
                "#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,AUDIO=\"aud\",SUBTITLES=\"subs\"\nv1080/v.m3u8\n" +
                "#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=854x480,AUDIO=\"aud\"\nv480/v.m3u8\n").toByteArray(),
            "/v1080/v.m3u8" to "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k.key\"\n#EXTINF:4,\ns0.ts\n#EXTINF:4,\ns1.ts\n#EXT-X-ENDLIST\n".toByteArray(),
            "/v1080/k.key" to ByteArray(16) { 7 },
            "/v1080/s0.ts" to ByteArray(5000) { 1 },
            "/v1080/s1.ts" to ByteArray(6000) { 2 },
            "/audio/a.m3u8" to "#EXTM3U\n#EXTINF:4,\na0.aac\n#EXT-X-ENDLIST\n".toByteArray(),
            "/audio/a0.aac" to ByteArray(700) { 3 },
            "/sub.vtt" to "WEBVTT\n\n00:00.000 --> 00:01.000\nBonjour\n".toByteArray(),
        )
        // A very small web server (plain sockets: usable in the Android unit tests).
        server = ServerSocket(0)
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val sock = runCatching { server.accept() }.getOrNull() ?: break
                thread(isDaemon = true) {
                    sock.use { so ->
                        val reader = so.getInputStream().bufferedReader()
                        val path = (reader.readLine() ?: "").split(" ").getOrElse(1) { "/" }.substringBefore('?')
                        var range = ""
                        while (true) { val l = reader.readLine() ?: break; if (l.isEmpty()) break; if (l.startsWith("Range:", true)) range = l.substringAfter(':').trim() }
                        hits.add(path); ranges.add("$path $range".trim())
                        val body = files[path]
                        val out = so.getOutputStream()
                        val route = routes[path]
                        try {
                            if (route != null) route(Req(path, range, counts.merge(path, 1) { a, b -> a + b }!!, out, so))
                            else if (body == null) out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
                            else { out.write("HTTP/1.1 200 OK\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray()); out.write(body) }
                            out.flush()
                        } catch (e: Exception) { /* the download hung up */ }
                    }
                }
            }
        }
        dl = VideoDownloads(root, OkHttpClient()) { active.add(it) }
    }

    @After fun tearDown() { server.close(); root.deleteRecursively() }

    private fun waitFor(id: String, from: VideoDownloads = dl): DlItem {
        repeat(200) { from.list().firstOrNull { it.id == id && (it.state == "done" || it.state == "error") }?.let { return it }; Thread.sleep(50) }
        throw AssertionError("download did not finish: " + from.list())
    }

    @Test fun directFileWithSubtitle() {
        val id = dl.start(DlStart("movie", "m1", "Film", "", "/watch/1", "Film", 0.0, "movie:m1",
            listOf(DlCandidate(base() + "/missing.mp4", "file", "dead"), DlCandidate(base() + "/movie.mkv", "file", "1080p", listOf(DlSub(base() + "/sub.vtt", "Français", "fr")))))).id
        val d = waitFor(id)
        assertEquals("done", d.state); assertTrue(d.file, Regex("^p[0-9a-f]{10}/video\\.mkv$").matches(d.file)); assertEquals("file", d.type); assertEquals("1080p", d.title)
        val part = d.file.substringBefore('/')
        assertEquals(300_000L, File(root, "$id/${d.file}").length())
        assertEquals(listOf(DlSavedSub("Français", "fr", "$part/sub0.vtt")), d.subtitles)
        assertTrue(d.size >= 300_000L)
        // Only the stream that was saved is left, without the notes for going on.
        assertEquals(setOf("meta.json", part), File(root, id).list()!!.toSet())
        assertEquals(setOf("video.mkv", "sub0.vtt"), File(root, "$id/$part").list()!!.toSet())
        // Served to the player; nothing outside the folder, never the description file.
        assertNotNull(dl.fileFor("$id/${d.file}")); assertNotNull(dl.fileFor("$id/$part/sub0.vtt"))
        assertNull(dl.fileFor("$id/meta.json")); assertNull(dl.fileFor("../x")); assertNull(dl.fileFor("$id/nope.ts"))
        assertEquals(1, dl.usage().count)
        Thread.sleep(100)
        assertEquals(listOf(true, false), active.toList())
        // Listed again after a restart of the app.
        assertEquals("done", VideoDownloads(root, OkHttpClient()).list().single().state)
        dl.remove(id)
        assertTrue(dl.list().isEmpty()); assertFalse(File(root, id).exists())
    }

    @Test fun hlsKeepsTheBestVariantUpTo1080pWithItsAudioAndKey() {
        val id = dl.start(DlStart("series", "s1", "Série", "", "/ep/1", "E1", 1.0, "series:s1:/ep/1", listOf(DlCandidate(base() + "/master.m3u8", "hls", "auto")))).id
        val d = waitFor(id)
        assertEquals("done", d.state); assertEquals("hls", d.type); assertTrue(d.file, d.file.endsWith("/index.m3u8"))
        val dir = File(root, id + "/" + d.file.substringBefore('/'))
        val master = File(dir, "index.m3u8").readText()
        assertTrue(master, master.contains("RESOLUTION=1920x1080") && !master.contains("3840") && !master.contains("SUBTITLES"))
        assertTrue(master, master.contains("URI=\"a0_index.m3u8\"") && master.trim().endsWith("vindex.m3u8"))
        val v = File(dir, "vindex.m3u8").readText()
        assertTrue(v, v.contains("URI=\"v0.key\"") && v.contains("\nv1.ts\n") && v.contains("\nv2.ts\n"))
        assertEquals(5000L, File(dir, "v1.ts").length()); assertEquals(6000L, File(dir, "v2.ts").length()); assertEquals(16L, File(dir, "v0.key").length())
        assertEquals(700L, File(dir, "a0_0.aac").length())
        assertFalse(hits.any { it.startsWith("/v2160") || it.startsWith("/v480") })
    }

    @Test fun failuresAndRules() {
        val id = dl.start(DlStart("anime", "a1", "A", "", "/e", "E", 1.0, "k", listOf(DlCandidate(base() + "/gone.mp4")))).id
        val d = waitFor(id)
        assertEquals("error", d.state); assertEquals("HTTP 404", d.error); assertFalse(File(root, id).exists())
        // Only streams relayed by the engine are accepted.
        val refused = runCatching { dl.start(DlStart("anime", "a1", "A", "", "/e2", "E", 2.0, "k", listOf(DlCandidate("https://example.com/v.mp4")))) }
        assertTrue(refused.exceptionOrNull() is DlError)
        assertEquals(VideoDownloads.idFor("anime", "a1", "/e"), id)
    }

    @Test fun aDirectFileGoesOnFromWhereItStoppedWhenTheConnectionGoesSilentThenDrops() {
        routes["/film.mp4"] = { r ->
            when (r.n) {
                1 -> { r.ranged(film, 1000); Thread.sleep(2500) }          // 1000 bytes, then nothing more
                2 -> { r.ranged(film, 2500); r.socket.close() }            // 1500 more, then the line drops
                else -> r.ranged(film)
            }
        }
        val q = quick()
        val id = q.start(DlStart("movie", "m", "Film", "", "/m", "Film", 0.0, "k", listOf(DlCandidate(base() + "/film.mp4")))).id
        val d = waitFor(id, q)
        assertEquals(d.error, "done", d.state)
        assertTrue(film.contentEquals(File(root, "$id/${d.file}").readBytes()))
        assertEquals(listOf("/film.mp4", "/film.mp4 bytes=1000-", "/film.mp4 bytes=2500-"), ranges.toList())
    }

    @Test fun aServerThatIgnoresRangeOrWhoseFileChangedMakesTheFileStartOver() {
        val longer = (film + film).reversedArray()
        routes["/norange.mp4"] = { r -> if (r.n == 1) { r.ranged(film, 1200); r.socket.close() } else r.ranged(film, honour = false) }
        routes["/longer.mp4"] = { r -> if (r.n == 1) { r.ranged(film, 900); r.socket.close() } else r.ranged(longer) }
        val q = quick()
        val a = q.start(DlStart("movie", "a", "A", "", "/a", "A", 0.0, "k", listOf(DlCandidate(base() + "/norange.mp4")))).id
        val da = waitFor(a, q)
        assertEquals(da.error, "done", da.state); assertTrue(film.contentEquals(File(root, "$a/${da.file}").readBytes()))
        val b = q.start(DlStart("movie", "b", "B", "", "/b", "B", 0.0, "k", listOf(DlCandidate(base() + "/longer.mp4")))).id
        val db = waitFor(b, q)
        assertEquals(db.error, "done", db.state); assertTrue(longer.contentEquals(File(root, "$b/${db.file}").readBytes()))
        assertEquals(listOf("/longer.mp4", "/longer.mp4 bytes=900-", "/longer.mp4"), ranges.filter { it.startsWith("/longer") })
    }

    @Test fun anHlsDownloadThatFailedKeepsItsSegmentsAndTheNextTryOnlyFetchesWhatIsMissing() {
        var broken = true
        var key = "KEY-ONE"
        routes["/h/v.m3u8"] = { r -> r.text("#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"key\"\n" + (1..6).joinToString("") { "#EXTINF:4,\nseg$it.ts?token=T${r.n}\n" } + "#EXT-X-ENDLIST\n") }
        routes["/h/key"] = { r -> r.text(key) }
        for (i in 1..6) routes["/h/seg$i.ts"] = { r -> if (i == 4 && broken) { Thread.sleep(150); r.status(404) } else r.text("SEG$i") }
        val q = quick()
        val p = DlStart("anime", "a", "A", "", "/1", "E1", 1.0, "k", listOf(DlCandidate(base() + "/h/v.m3u8?token=a", "hls")))
        val id = q.start(p).id
        val first = waitFor(id, q)
        assertEquals("error", first.state); assertEquals("HTTP 404", first.error)
        val parts = File(root, id).list()!!.toList()
        assertEquals("the part is kept", 1, parts.size)
        assertEquals(listOf("v1.ts", "v2.ts", "v3.ts", "v5.ts", "v6.ts"), File(root, "$id/${parts[0]}").list()!!.filter { it.endsWith(".ts") }.sorted())
        // Fresh links (another token), the missing segment is back: only that one is fetched.
        broken = false
        q.start(p.copy(candidates = listOf(DlCandidate(base() + "/h/v.m3u8?token=b", "hls"))))
        val again = waitFor(id, q)
        assertEquals(again.error, "done", again.state)
        for (i in listOf(1, 2, 3, 5, 6)) assertEquals("segment $i is not fetched twice", 1, hits.count { it == "/h/seg$i.ts" })
        assertEquals(2, hits.count { it == "/h/seg4.ts" })
        val dir = File(root, id + "/" + again.file.substringBefore('/'))
        for (i in 1..6) assertEquals("SEG$i", File(dir, "v$i.ts").readText())
        assertFalse(dir.list()!!.any { it.endsWith("resume.json") || it.endsWith(".part") })
        // Another key: what is saved cannot be read with it, everything is fetched again.
        broken = true
        val other = q.start(p.copy(episodeUrl = "/2")).id
        assertEquals("error", waitFor(other, q).state)
        broken = false; key = "KEY-TWO"
        val before = hits.size
        q.start(p.copy(episodeUrl = "/2"))
        val whole = waitFor(other, q)
        assertEquals(whole.error, "done", whole.state)
        assertEquals(6, hits.drop(before).count { it.startsWith("/h/seg") })
        assertEquals("KEY-TWO", File(root, other + "/" + whole.file.substringBefore('/') + "/v0.key").readText())
    }

    @Test fun aStreamThatDiesGivesWayToTheNextOneAndLeavesNothingBehind() {
        routes["/a.m3u8"] = { r -> r.text("#EXTM3U\n" + (1..5).joinToString("") { "#EXTINF:4,\na$it.ts\n" } + "#EXT-X-ENDLIST\n") }
        routes["/b.m3u8"] = { r -> r.text("#EXTM3U\n#EXTINF:4,\nb1.ts\n#EXTINF:4,\nb2.ts\n#EXT-X-ENDLIST\n") }
        for (i in 1..5) routes["/a$i.ts"] = { r -> if (i >= 3) r.status(503) else if (i == 2 && r.n <= 3) r.status(502) else r.text("A$i") }
        routes["/b1.ts"] = { r -> r.text("B1") }; routes["/b2.ts"] = { r -> r.text("B2") }
        val q = VideoDownloads(root, OkHttpClient(), retryMs = 10, patienceMs = 300)
        val id = q.start(DlStart("anime", "a", "A", "", "/2", "E2", 2.0, "k", listOf(DlCandidate(base() + "/a.m3u8", "hls", "A"), DlCandidate(base() + "/b.m3u8", "hls", "B")))).id
        val d = waitFor(id, q)
        assertEquals(d.error, "done", d.state); assertEquals("B", d.title)
        // The part of the stream that died is gone, and nothing of it was written into the other one.
        val part = d.file.substringBefore('/')
        assertEquals(setOf("meta.json", part), File(root, id).list()!!.toSet())
        assertEquals(listOf("v0.ts", "v1.ts", "vindex.m3u8"), File(root, "$id/$part").list()!!.sorted())
    }

    @Test fun whatWasSavedBeforeTheAppClosedIsGoneOnFromAndRubbishIsCleared() {
        // As the app left it when it was closed: 1500 bytes of a file of 4000.
        val c = DlCandidate(base() + "/film.mp4?token=1")
        val id = VideoDownloads.idFor("movie", "m", "/m")
        val part = File(root, id + "/" + VideoDownloads.partOf(c)).apply { mkdirs() }
        File(part, "video.mp4").writeBytes(film.copyOf(1500)); File(part, "video.mp4.resume.json").writeText("{\"total\":4000}")
        // Rubbish from older runs: an empty folder, and a part nobody came back to for a week.
        File(root, "movie_empty_0000000000/p0123456789").mkdirs()
        val old = File(root, "movie_old_0000000000/p0123456789").apply { mkdirs() }
        val longAgo = System.currentTimeMillis() - 8L * 24 * 3600 * 1000
        File(old, "video.mp4").apply { writeText("x"); setLastModified(longAgo) }; old.setLastModified(longAgo); old.parentFile!!.setLastModified(longAgo)
        // …and a folder somebody put there by hand: not ours to delete.
        File(root, "Mes films").mkdirs(); File(root, "Mes films/film.mkv").writeText("x")
        routes["/film.mp4"] = { r -> r.ranged(film) }
        val q = quick()
        assertEquals(setOf(id, "Mes films"), root.list()!!.toSet()); assertTrue("an unfinished download is not listed as done", q.list().isEmpty())
        q.start(DlStart("movie", "m", "Film", "", "/m", "Film", 0.0, "k", listOf(DlCandidate(base() + "/film.mp4?token=2"))))
        val d = waitFor(id, q)
        assertEquals(d.error, "done", d.state)
        assertEquals(listOf("/film.mp4 bytes=1500-"), ranges.toList())
        assertTrue(film.contentEquals(File(root, "$id/${d.file}").readBytes()))
    }

    @Test fun cancellingKeepsNothingAndDoesNotWaitForTheNetwork() {
        routes["/film.mp4"] = { r -> r.ranged(film, 1500); Thread.sleep(8000) }
        val q = quick(readMs = 20000)
        val id = q.start(DlStart("movie", "c", "C", "", "/c", "C", 0.0, "k", listOf(DlCandidate(base() + "/film.mp4")))).id
        repeat(100) { if ((q.list().firstOrNull { it.id == id }?.bytes ?: 0) < 1500) Thread.sleep(20) }
        assertEquals(1500L, q.list().first { it.id == id }.bytes)
        q.cancel(id)
        repeat(100) { if (File(root, id).exists()) Thread.sleep(20) }
        assertFalse("the folder is gone within two seconds", File(root, id).exists()); assertTrue(q.list().none { it.id == id })
        // Cancelled, then asked for again at once: the new download is not swept away with the old one.
        var hang = true
        routes["/again.mp4"] = { r -> if (hang) { r.ranged(film, 1500); Thread.sleep(8000) } else r.ranged(film) }
        val p = DlStart("movie", "d", "D", "", "/d", "D", 0.0, "k", listOf(DlCandidate(base() + "/again.mp4")))
        val other = q.start(p).id
        repeat(100) { if ((q.list().firstOrNull { it.id == other }?.bytes ?: 0) < 1500) Thread.sleep(20) }
        q.remove(other); hang = false
        assertEquals(other, q.start(p).id)
        val d = waitFor(other, q)
        assertEquals(d.error, "done", d.state)
        assertTrue(film.contentEquals(File(root, "$other/${d.file}").readBytes()))
    }

    @Test fun sameStreamSamePartWhateverTheTokens() {
        val a = DlCandidate("http://127.0.0.1:4567/api/v1/hls?url=" + java.net.URLEncoder.encode("https://cdn1.example.com/v/720/master.m3u8?token=abc&expires=1&id=7", "UTF-8") + "&sourceId=1", "hls")
        val b = DlCandidate("http://127.0.0.1:9999/api/v1/hls?url=" + java.net.URLEncoder.encode("https://cdn2.example.com/v/720/master.m3u8?token=xyz&expires=2&id=7", "UTF-8") + "&sourceId=1&headers=x", "hls")
        val c = DlCandidate("http://127.0.0.1:4567/api/v1/hls?url=" + java.net.URLEncoder.encode("https://cdn1.example.com/v/1080/master.m3u8?token=abc&id=7", "UTF-8"), "hls")
        assertEquals("/v/720/master.m3u8?id=7", VideoDownloads.pathOf(a.url))
        assertEquals(VideoDownloads.partOf(a), VideoDownloads.partOf(b))
        assertFalse(VideoDownloads.partOf(a) == VideoDownloads.partOf(c))
        assertFalse(VideoDownloads.partOf(a) == VideoDownloads.partOf(a.copy(type = "file")))
        assertTrue(VideoDownloads.isPart(VideoDownloads.partOf(a)))
    }

    @Test fun byteRanges() {
        assertEquals(0L to 99L, parseRange("bytes=0-99", 1000))
        assertEquals(500L to 999L, parseRange("bytes=500-", 1000))
        assertEquals(900L to 999L, parseRange("bytes=-100", 1000))
        assertEquals(0L to 999L, parseRange("bytes=0-5000", 1000))
        assertEquals(-1L to -1L, parseRange("bytes=2000-", 1000))
        assertNull(parseRange(null, 1000)); assertNull(parseRange("bytes=-", 1000))
    }
}
