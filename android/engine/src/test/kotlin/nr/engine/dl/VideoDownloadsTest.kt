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
class VideoDownloadsTest {
    private lateinit var server: ServerSocket
    private lateinit var root: File
    private lateinit var dl: VideoDownloads
    private val hits = java.util.Collections.synchronizedList(ArrayList<String>())
    private val active = java.util.Collections.synchronizedList(ArrayList<Boolean>())
    private fun base() = "http://127.0.0.1:${server.localPort}"

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
                        while (true) { val l = reader.readLine() ?: break; if (l.isEmpty()) break }
                        hits.add(path)
                        val body = files[path]
                        val out = so.getOutputStream()
                        if (body == null) out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
                        else { out.write("HTTP/1.1 200 OK\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray()); out.write(body) }
                        out.flush()
                    }
                }
            }
        }
        dl = VideoDownloads(root, OkHttpClient()) { active.add(it) }
    }

    @After fun tearDown() { server.close(); root.deleteRecursively() }

    private fun waitFor(id: String): DlItem {
        repeat(200) { dl.list().firstOrNull { it.id == id && (it.state == "done" || it.state == "error") }?.let { return it }; Thread.sleep(50) }
        throw AssertionError("download did not finish: " + dl.list())
    }

    @Test fun directFileWithSubtitle() {
        val id = dl.start(DlStart("movie", "m1", "Film", "", "/watch/1", "Film", 0.0, "movie:m1",
            listOf(DlCandidate(base() + "/missing.mp4", "file", "dead"), DlCandidate(base() + "/movie.mkv", "file", "1080p", listOf(DlSub(base() + "/sub.vtt", "Français", "fr")))))).id
        val d = waitFor(id)
        assertEquals("done", d.state); assertEquals("video.mkv", d.file); assertEquals("file", d.type); assertEquals("1080p", d.title)
        assertEquals(300_000L, File(root, "$id/video.mkv").length())
        assertEquals(listOf(DlSavedSub("Français", "fr", "sub0.vtt")), d.subtitles)
        assertTrue(d.size >= 300_000L)
        // Served to the player; nothing outside the folder, never the description file.
        assertNotNull(dl.fileFor("$id/video.mkv"))
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
        assertEquals("done", d.state); assertEquals("hls", d.type); assertEquals("index.m3u8", d.file)
        val dir = File(root, id)
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

    @Test fun byteRanges() {
        assertEquals(0L to 99L, parseRange("bytes=0-99", 1000))
        assertEquals(500L to 999L, parseRange("bytes=500-", 1000))
        assertEquals(900L to 999L, parseRange("bytes=-100", 1000))
        assertEquals(0L to 999L, parseRange("bytes=0-5000", 1000))
        assertEquals(-1L to -1L, parseRange("bytes=2000-", 1000))
        assertNull(parseRange(null, 1000)); assertNull(parseRange("bytes=-", 1000))
    }
}
