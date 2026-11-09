package nr.engine.cast

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URI

/** Smart TVs that are DLNA "media renderers" (Samsung, LG, Sony, Philips…): same as electron/cast.cjs. */
data class TvDevice(
    val kind: String, val id: String, val name: String, val host: String, val port: Int = 0,
    val avType: String = "", val avControl: String = "", val rcType: String = "", val rcControl: String = "",
)

object Dlna {
    private fun xmlText(xml: String, tag: String): String {
        val m = Regex("<(?:\\w+:)?$tag[^>]*>([\\s\\S]*?)</(?:\\w+:)?$tag>", RegexOption.IGNORE_CASE).find(xml)
        return m?.groupValues?.get(1)?.trim() ?: ""
    }

    fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    fun parseDescription(xml: String, location: String): TvDevice? {
        val name = xmlText(xml, "friendlyName").ifBlank { "TV" }
        val services = Regex("<(?:\\w+:)?service>([\\s\\S]*?)</(?:\\w+:)?service>", RegexOption.IGNORE_CASE).findAll(xml)
            .map { xmlText(it.groupValues[1], "serviceType") to xmlText(it.groupValues[1], "controlURL") }.toList()
        val av = services.firstOrNull { it.first.contains("AVTransport", true) } ?: return null
        val rc = services.firstOrNull { it.first.contains("RenderingControl", true) }
        val base = xmlText(xml, "URLBase").ifBlank { location }
        fun abs(u: String) = URI(base).resolve(u).toString()
        return TvDevice(
            kind = "dlna", id = "dlna:" + xmlText(xml, "UDN").ifBlank { location }, name = name.replace("&amp;", "&"),
            host = URI(location).host ?: "", avType = av.first, avControl = abs(av.second),
            rcType = rc?.first ?: "", rcControl = rc?.let { abs(it.second) } ?: "",
        )
    }

    fun soapBody(type: String, action: String, args: List<Pair<String, String>>) =
        "<?xml version=\"1.0\" encoding=\"utf-8\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:$action xmlns:u=\"$type\">" +
            args.joinToString("") { (k, v) -> "<$k>${esc(v)}</$k>" } + "</u:$action></s:Body></s:Envelope>"

    fun didl(url: String, title: String, mime: String) =
        "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\"><item id=\"0\" parentID=\"-1\" restricted=\"1\"><dc:title>${esc(title)}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo=\"http-get:*:$mime:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000\">${esc(url)}</res></item></DIDL-Lite>"

    fun hms(s0: Double): String {
        val s = maxOf(0, s0.toInt())
        return "%02d:%02d:%02d".format(s / 3600, s % 3600 / 60, s % 60)
    }

    fun secs(t: String): Double {
        val p = t.split(":").map { it.trim().toDoubleOrNull() }
        return if (p.size == 3 && p.all { it != null }) p[0]!! * 3600 + p[1]!! * 60 + p[2]!! else 0.0
    }

    /** M-SEARCH on the local network; calls onLocation for each answer. */
    fun ssdpSearch(timeoutMs: Long, onLocation: (String) -> Unit) {
        val sock = DatagramSocket()
        try {
            sock.soTimeout = 300
            val group = InetAddress.getByName("239.255.255.250")
            for (round in 0 until 2) for (st in listOf("urn:schemas-upnp-org:device:MediaRenderer:1", "urn:schemas-upnp-org:service:AVTransport:1")) {
                val msg = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: $st\r\n\r\n".toByteArray()
                runCatching { sock.send(DatagramPacket(msg, msg.size, group, 1900)) }
            }
            val end = System.currentTimeMillis() + timeoutMs
            val buf = ByteArray(4096)
            while (System.currentTimeMillis() < end) {
                val p = DatagramPacket(buf, buf.size)
                try { sock.receive(p) } catch (_: SocketTimeoutException) { continue }
                val text = String(p.data, 0, p.length)
                Regex("^location:\\s*(.+)$", setOf(RegexOption.IGNORE_CASE, RegexOption.MULTILINE)).find(text)?.let { onLocation(it.groupValues[1].trim()) }
            }
        } finally { sock.close() }
    }
}

class DlnaPlayer(private val d: TvDevice, private val http: OkHttpClient) : TvPlayer {
    private fun soap(control: String, type: String, action: String, args: List<Pair<String, String>>): String {
        val req = Request.Builder().url(control)
            .header("SOAPAction", "\"$type#$action\"")
            .post(Dlna.soapBody(type, action, args).toRequestBody("text/xml; charset=\"utf-8\"".toMediaType()))
            .build()
        http.newCall(req).execute().use { r ->
            val text = r.body.string()
            if (!r.isSuccessful) {
                val e = Regex("<(?:\\w+:)?errorDescription>([\\s\\S]*?)<", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)
                throw IllegalStateException(d.name + ": " + (e ?: "HTTP ${r.code}"))
            }
            return text
        }
    }

    private fun av(action: String, vararg args: Pair<String, String>) = soap(d.avControl, d.avType, action, listOf("InstanceID" to "0") + args)

    override fun load(url: String, title: String, mime: String, startAt: Double, subtitles: List<CastV2Client.Track>) {
        runCatching { av("Stop") }
        av("SetAVTransportURI", "CurrentURI" to url, "CurrentURIMetaData" to Dlna.didl(url, title, mime))
        av("Play", "Speed" to "1")
        if (startAt > 5) { Thread.sleep(2500); runCatching { av("Seek", "Unit" to "REL_TIME", "Target" to Dlna.hms(startAt)) } }
    }
    override fun play() { av("Play", "Speed" to "1") }
    override fun pause() { av("Pause") }
    override fun stop() { runCatching { av("Stop") } }
    override fun seek(t: Double) { av("Seek", "Unit" to "REL_TIME", "Target" to Dlna.hms(t)) }
    override fun volume(v: Double) {
        if (d.rcControl.isNotBlank()) soap(d.rcControl, d.rcType, "SetVolume", listOf("InstanceID" to "0", "Channel" to "Master", "DesiredVolume" to Math.round(v * 100).toString()))
    }
    override fun status(): CastStatus {
        val p = av("GetPositionInfo")
        val state = runCatching { Regex("<CurrentTransportState>([^<]*)<").find(av("GetTransportInfo"))?.groupValues?.get(1) ?: "" }.getOrDefault("")
        fun tag(t: String) = Regex("<$t>([^<]*)<").find(p)?.groupValues?.get(1) ?: ""
        return CastStatus(Dlna.secs(tag("RelTime")), Dlna.secs(tag("TrackDuration")), state == "PLAYING", state.lowercase())
    }
    override fun close() {}
}
