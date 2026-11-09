package nr.engine.cast

import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.DataInputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.Collections

class CastTest {
    @Test fun protocolRoundTrip() {
        val m = CastMessage("sender-0", "receiver-0", CastProtocol.RECEIVER, "{\"type\":\"LAUNCH\",\"é\":\"" + "x".repeat(300) + "\"}")
        val b = CastProtocol.encode(m)
        val len = ((b[0].toInt() and 0xFF) shl 24) or ((b[1].toInt() and 0xFF) shl 16) or ((b[2].toInt() and 0xFF) shl 8) or (b[3].toInt() and 0xFF)
        assertEquals(b.size - 4, len)
        assertEquals(m, CastProtocol.decode(b.copyOfRange(4, b.size)))
    }

    /** A pretend Chromecast: answers like the Default Media Receiver. */
    private fun fakeChromecast(log: MutableList<String>): ServerSocket {
        val server = ServerSocket(0)
        Thread {
            val s = server.accept()
            val input = DataInputStream(s.getInputStream())
            val out = s.getOutputStream()
            fun send(o: OutputStream, ns: String, src: String, payload: String) { o.write(CastProtocol.encode(CastMessage(src, "sender-0", ns, payload))); o.flush() }
            var time = 0.0
            var state = "IDLE"
            try {
                while (true) {
                    val b = ByteArray(input.readInt()); input.readFully(b)
                    val m = CastProtocol.decode(b)
                    val p = Json.parseToJsonElement(m.payload).jsonObject
                    val type = p["type"]!!.jsonPrimitive.content
                    val id = p["requestId"]?.jsonPrimitive?.int
                    synchronized(log) { log.add("${m.destination} $type") }
                    when (type) {
                        "LAUNCH" -> send(out, m.namespace, "receiver-0", "{\"type\":\"RECEIVER_STATUS\",\"requestId\":$id,\"status\":{\"applications\":[{\"appId\":\"CC1AD845\",\"transportId\":\"web-7\"}]}}")
                        "LOAD" -> {
                            val media = p["media"]!!.jsonObject
                            synchronized(log) { log.add("url=" + media["contentId"]!!.jsonPrimitive.content + " type=" + media["contentType"]!!.jsonPrimitive.content + " tracks=" + (media["tracks"]?.toString()?.contains("text/vtt") == true)) }
                            time = p["currentTime"]!!.jsonPrimitive.content.toDouble(); state = "PLAYING"
                            send(out, m.namespace, "web-7", "{\"type\":\"MEDIA_STATUS\",\"requestId\":$id,\"status\":[{\"mediaSessionId\":3,\"playerState\":\"PLAYING\",\"currentTime\":$time,\"media\":{\"duration\":1440}}]}")
                        }
                        "PAUSE", "PLAY", "SEEK", "GET_STATUS" -> {
                            if (type == "PAUSE") state = "PAUSED"; if (type == "PLAY") state = "PLAYING"
                            if (type == "SEEK") time = p["currentTime"]!!.jsonPrimitive.content.toDouble()
                            synchronized(log) { log.add("session=" + p["mediaSessionId"]?.jsonPrimitive?.content) }
                            send(out, m.namespace, "web-7", "{\"type\":\"MEDIA_STATUS\",\"requestId\":$id,\"status\":[{\"mediaSessionId\":3,\"playerState\":\"$state\",\"currentTime\":$time,\"media\":{\"duration\":1440}}]}")
                        }
                        "SET_VOLUME", "STOP" -> send(out, m.namespace, m.destination, "{\"type\":\"RECEIVER_STATUS\",\"requestId\":$id}")
                    }
                }
            } catch (_: Exception) {}
        }.start()
        return server
    }

    @Test fun chromecastLaunchLoadControl() {
        val log = Collections.synchronizedList(mutableListOf<String>())
        val server = fakeChromecast(log)
        val c = CastV2Client("127.0.0.1", server.localPort) { Socket("127.0.0.1", server.localPort) }
        c.connect(); c.launch()
        assertEquals("web-7", c.transportId)
        c.load("http://192.168.1.5:4570/t/x/4567/api/v1/hls?u=1", "application/x-mpegURL", "Ep 1", 120.0, listOf(CastV2Client.Track("http://192.168.1.5:4570/t/x/4567/s.vtt", "fr", "Français")))
        assertEquals(3, c.mediaSessionId)
        c.pause()
        assertEquals("PAUSED", c.status().third)
        c.seek(300.0)
        val (t, d, st) = c.status()
        assertEquals(300.0, t, 0.01); assertEquals(1440.0, d, 0.01); assertEquals("PAUSED", st)
        c.volume(0.4)
        c.close(); server.close()
        assertTrue(log.toString(), log.contains("receiver-0 CONNECT"))
        assertTrue(log.toString(), log.contains("web-7 CONNECT"))
        assertTrue(log.toString(), log.contains("url=http://192.168.1.5:4570/t/x/4567/api/v1/hls?u=1 type=application/x-mpegURL tracks=true"))
        assertTrue(log.toString(), log.contains("session=3"))
    }

    @Test fun dlnaDescriptionAndControl() {
        val calls = Collections.synchronizedList(mutableListOf<String>())
        val http = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val desc = """<?xml version="1.0"?><root><device><friendlyName>Salon TV &amp; Co</friendlyName><UDN>uuid:tv1</UDN><serviceList>
            <service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>/rc</controlURL></service>
            <service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/av</controlURL></service></serviceList></device></root>"""
        http.createContext("/desc.xml") { ex -> val b = desc.toByteArray(); ex.sendResponseHeaders(200, b.size.toLong()); ex.responseBody.use { it.write(b) } }
        for (path in listOf("/av", "/rc")) http.createContext(path) { ex ->
            val action = ex.requestHeaders.getFirst("SOAPAction")
            val body = ex.requestBody.readBytes().toString(Charsets.UTF_8)
            calls.add("$path $action " + Regex("<(CurrentURI|Target|DesiredVolume)>([^<]*)<").findAll(body).joinToString(",") { it.groupValues[2] })
            val resp = when {
                action.contains("GetPositionInfo") -> "<s:Envelope><s:Body><u:R><RelTime>00:01:05</RelTime><TrackDuration>00:24:00</TrackDuration></u:R></s:Body></s:Envelope>"
                action.contains("GetTransportInfo") -> "<s:Envelope><s:Body><u:R><CurrentTransportState>PLAYING</CurrentTransportState></u:R></s:Body></s:Envelope>"
                else -> "<s:Envelope/>"
            }.toByteArray()
            ex.sendResponseHeaders(200, resp.size.toLong()); ex.responseBody.use { it.write(resp) }
        }
        http.start()
        val loc = "http://127.0.0.1:${http.address.port}/desc.xml"
        val client = OkHttpClient()
        val d = Dlna.parseDescription(client.newCall(okhttp3.Request.Builder().url(loc).build()).execute().body.string(), loc)!!
        assertEquals("Salon TV & Co", d.name)
        assertEquals("dlna:uuid:tv1", d.id)
        assertEquals("http://127.0.0.1:${http.address.port}/av", d.avControl)
        val p = DlnaPlayer(d, client)
        p.load("http://192.168.1.5:4570/t/x/4567/api/v1/proxy?u=a&b=c", "Film", "video/mp4", 0.0, emptyList())
        p.seek(3725.0); p.volume(0.3)
        val st = p.status()
        http.stop(0)
        assertEquals(65.0, st.time, 0.01); assertEquals(1440.0, st.duration, 0.01); assertTrue(st.playing)
        assertTrue(calls.toString(), calls.any { it.contains("#SetAVTransportURI") && it.contains("http://192.168.1.5:4570/t/x/4567/api/v1/proxy?u=a&amp;b=c") })
        assertTrue(calls.toString(), calls.any { it.contains("#Seek") && it.contains("01:02:05") })
        assertTrue(calls.toString(), calls.any { it.startsWith("/rc") && it.contains("#SetVolume") && it.endsWith(" 30") })
    }

    @Test fun relayAddresses() {
        val r = CastRelay(OkHttpClient())
        val lan = r.toLan("http://127.0.0.1:4567/api/v1/hls?url=a%20b&x=1", "192.168.1.5")
        assertTrue(lan, Regex("^http://192\\.168\\.1\\.5:\\d+/t/[0-9a-f]{24}/4567/api/v1/hls\\?url=a%20b&x=1$").matches(lan))
        assertEquals("https://cdn.example/v.mp4", r.toLan("https://cdn.example/v.mp4", "192.168.1.5"))
        val out = r.rewritePlaylist("#EXTM3U\nhttp://127.0.0.1:4567/api/v1/proxy?s=1\nhttps://cdn/x.ts\n", "192.168.1.5")
        assertTrue(out, out.contains("http://192.168.1.5:") && out.contains("/4567/api/v1/proxy?s=1") && out.contains("https://cdn/x.ts"))
        assertEquals("application/x-mpegURL", mimeOf("http://127.0.0.1:4567/api/v1/hls?u=x"))
        assertEquals("video/x-matroska", mimeOf("http://127.0.0.1:4567/api/v1/proxy?url=https%3A%2F%2Fa%2Fb.mkv"))
    }
}
