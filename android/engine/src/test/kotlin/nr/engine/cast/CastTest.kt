package nr.engine.cast

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
        val desc = """<?xml version="1.0"?><root><device><friendlyName>Salon TV &amp; Co</friendlyName><UDN>uuid:tv1</UDN><serviceList>
            <service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>/rc</controlURL></service>
            <service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/av</controlURL></service></serviceList></device></root>"""
        val http = TinyHttp { path, headers, body ->
            if (path == "/desc.xml") return@TinyHttp desc
            val action = headers["soapaction"] ?: ""
            calls.add("$path $action " + Regex("<(CurrentURI|Target|DesiredVolume)>([^<]*)<").findAll(body).joinToString(",") { it.groupValues[2] })
            when {
                action.contains("GetPositionInfo") -> "<s:Envelope><s:Body><u:R><RelTime>00:01:05</RelTime><TrackDuration>00:24:00</TrackDuration></u:R></s:Body></s:Envelope>"
                action.contains("GetTransportInfo") -> "<s:Envelope><s:Body><u:R><CurrentTransportState>PLAYING</CurrentTransportState></u:R></s:Body></s:Envelope>"
                else -> "<s:Envelope/>"
            }
        }
        val loc = "http://127.0.0.1:${http.port}/desc.xml"
        val client = OkHttpClient()
        val d = Dlna.parseDescription(client.newCall(okhttp3.Request.Builder().url(loc).build()).execute().body.string(), loc)!!
        assertEquals("Salon TV & Co", d.name)
        assertEquals("dlna:uuid:tv1", d.id)
        assertEquals("http://127.0.0.1:${http.port}/av", d.avControl)
        val p = DlnaPlayer(d, client)
        p.load("http://192.168.1.5:4570/t/x/4567/api/v1/proxy?u=a&b=c", "Film", "video/mp4", 0.0, emptyList())
        p.seek(3725.0); p.volume(0.3)
        val st = p.status()
        http.close()
        assertEquals(65.0, st.time, 0.01); assertEquals(1440.0, st.duration, 0.01); assertTrue(st.playing)
        assertTrue(calls.toString(), calls.any { it.contains("#SetAVTransportURI") && it.contains("http://192.168.1.5:4570/t/x/4567/api/v1/proxy?u=a&amp;b=c") })
        assertTrue(calls.toString(), calls.any { it.contains("#Seek") && it.contains("01:02:05") })
        assertTrue(calls.toString(), calls.any { it.startsWith("/rc") && it.contains("#SetVolume") && it.endsWith(" 30") })
    }

    @Test fun mdnsGoogleTvAnswer() {
        val out = java.io.ByteArrayOutputStream()
        fun u16(v: Int) { out.write(v shr 8 and 0xFF); out.write(v and 0xFF) }
        fun name(n: String) { for (l in n.split('.')) { val b = l.toByteArray(); out.write(b.size); out.write(b) }; out.write(0) }
        fun rr(n: String, type: Int, data: ByteArray) { name(n); u16(type); u16(0x8001); u16(0); u16(120); u16(data.size); out.write(data) }
        fun nameBytes(n: String) = java.io.ByteArrayOutputStream().also { o -> for (l in n.split('.')) { val b = l.toByteArray(); o.write(b.size); o.write(b) }; o.write(0) }.toByteArray()
        u16(0); u16(0x8400); u16(0); u16(1); u16(0); u16(3)
        val inst = "TCL-Google-TV-abc._googlecast._tcp.local"
        rr("_googlecast._tcp.local", 12, nameBytes(inst))
        rr(inst, 33, byteArrayOf(0, 0, 0, 0, 0x1F, 0x49) + nameBytes("abc.local"))
        val txt = java.io.ByteArrayOutputStream().also { o -> for (kv in listOf("id=abc123", "fn=Salon TCL", "md=Google TV")) { o.write(kv.length); o.write(kv.toByteArray()) } }.toByteArray()
        rr(inst, 16, txt)
        rr("abc.local", 1, byteArrayOf(192.toByte(), 168.toByte(), 1, 42))
        val recs = Mdns.parse(out.toByteArray())
        assertEquals(4, recs.size)
        val d = Mdns.devices(recs).single()
        assertEquals("Salon TCL", d.name); assertEquals("192.168.1.42", d.host); assertEquals(8009, d.port); assertEquals("cast:abc123", d.id)
        val q = Mdns.query("_googlecast._tcp.local")
        assertEquals(12, q[q.size - 3].toInt()); assertEquals(0x80, q[q.size - 2].toInt() and 0xFF)
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

/** Minimal HTTP/1.1 server for the tests (one request per connection). */
class TinyHttp(private val handle: (String, Map<String, String>, String) -> String) : AutoCloseable {
    private val server = ServerSocket(0)
    val port get() = server.localPort
    init {
        Thread {
            while (!server.isClosed) {
                val s = try { server.accept() } catch (_: Exception) { break }
                Thread {
                    s.use { sock ->
                        val input = sock.getInputStream().buffered()
                        fun line(): String { val b = StringBuilder(); while (true) { val c = input.read(); if (c < 0 || c == '\n'.code) break; if (c != '\r'.code) b.append(c.toChar()) }; return b.toString() }
                        val path = line().split(" ").getOrElse(1) { "/" }
                        val headers = HashMap<String, String>()
                        while (true) { val l = line(); if (l.isEmpty()) break; val i = l.indexOf(':'); if (i > 0) headers[l.substring(0, i).trim().lowercase()] = l.substring(i + 1).trim() }
                        val n = headers["content-length"]?.toIntOrNull() ?: 0
                        val body = ByteArray(n); var got = 0; while (got < n) { val r = input.read(body, got, n - got); if (r < 0) break; got += r }
                        val out = handle(path, headers, String(body, Charsets.UTF_8)).toByteArray()
                        sock.getOutputStream().apply { write("HTTP/1.1 200 OK\r\nContent-Type: text/xml\r\nContent-Length: ${out.size}\r\nConnection: close\r\n\r\n".toByteArray()); write(out); flush() }
                    }
                }.start()
            }
        }.apply { isDaemon = true }.start()
    }
    override fun close() = server.close()
}

class CastProbeTest {
    @Test fun subnetAndName() {
        val hosts = CastProbe.subnetHosts("192.168.1.69")
        assertEquals(253, hosts.size); assertTrue(hosts.first() == "192.168.1.1" && hosts.last() == "192.168.1.254" && "192.168.1.69" !in hosts)
        assertEquals("Salon TCL", CastProbe.parseName("{\"name\":\"Salon TCL\",\"version\":12}"))
        assertEquals(null, CastProbe.parseName("{\"version\":12}"))
        val s = ServerSocket(0)
        assertTrue(CastProbe.portOpen("127.0.0.1", s.localPort, 500)); s.close()
        assertTrue(!CastProbe.portOpen("127.0.0.1", s.localPort, 300))
        // Device info page served like a Google TV does (port given by the fake server).
        val http = TinyHttp { _, _, _ -> "{\"name\":\"Salon TCL\"}" }
        val name = OkHttpClient().newCall(okhttp3.Request.Builder().url("http://127.0.0.1:${http.port}/setup/eureka_info?params=name").build()).execute().use { CastProbe.parseName(it.body.string()) }
        http.close()
        assertEquals("Salon TCL", name)
    }
}
