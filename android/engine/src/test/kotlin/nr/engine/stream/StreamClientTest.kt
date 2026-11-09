package nr.engine.stream

import miwayomi.api.streamingClient
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ServerSocket
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

// A video streamed through the engine must not be cut by the client's overall call
// timeout (it used to stop every stream at 2:00).
class StreamClientTest {
    private fun slowServer(): ServerSocket {
        val ss = ServerSocket(0)
        thread(isDaemon = true) {
            while (!ss.isClosed) {
                val s = runCatching { ss.accept() }.getOrNull() ?: break
                thread(isDaemon = true) {
                    s.use {
                        it.getInputStream().read(ByteArray(4096))
                        val out = it.getOutputStream()
                        out.write("HTTP/1.1 200 OK\r\nContent-Length: 6\r\nContent-Type: video/mp4\r\n\r\n".toByteArray()); out.flush()
                        repeat(6) { Thread.sleep(400); out.write('v'.code); out.flush() }
                    }
                }
            }
        }
        return ss
    }

    @Test fun streamOutlivesTheCallTimeout() {
        val ss = slowServer()
        val base = OkHttpClient.Builder().callTimeout(1, TimeUnit.SECONDS).build()
        val req = Request.Builder().url("http://127.0.0.1:${ss.localPort}/v.mp4").build()
        val cut = runCatching { base.newCall(req).execute().use { it.body!!.string() } }
        assertTrue("the plain client is cut by its call timeout", cut.isFailure)
        val body = streamingClient(base).newCall(req).execute().use { it.body!!.string() }
        assertEquals("vvvvvv", body)
        assertSame("one stream client per source client", streamingClient(base), streamingClient(base))
        ss.close()
    }
}
