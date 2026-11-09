package nr.engine.cast

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.Closeable
import java.io.DataInputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * Talks to a Chromecast / Google TV like the PC does with castv2-client: opens the
 * Default Media Receiver and loads the video (with subtitle tracks).
 * The TV's certificate is self-signed: it is not checked (local network only).
 */
class CastV2Client(
    private val host: String,
    private val port: Int,
    private val connectSocket: () -> Socket = { tlsSocket(host, port) },
) : Closeable {
    companion object {
        fun tlsSocket(host: String, port: Int): Socket {
            val trustAll = object : X509TrustManager {
                override fun checkClientTrusted(c: Array<out X509Certificate>?, a: String?) {}
                override fun checkServerTrusted(c: Array<out X509Certificate>?, a: String?) {}
                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            }
            val ctx = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustAll), SecureRandom()) }
            val raw = Socket().apply { connect(InetSocketAddress(host, port), 8000); soTimeout = 0 }
            return ctx.socketFactory.createSocket(raw, host, port, true)
        }
        private const val SENDER = "sender-0"
        private const val RECEIVER_ID = "receiver-0"
    }

    private val json = Json { ignoreUnknownKeys = true }
    private lateinit var socket: Socket
    private lateinit var out: OutputStream
    private val ids = AtomicInteger(1)
    private val waiting = ConcurrentHashMap<Int, ArrayBlockingQueue<JsonObject>>()
    @Volatile private var closed = false
    @Volatile var transportId: String? = null
        private set
    @Volatile var mediaSessionId: Int? = null
        private set
    @Volatile var lastMediaStatus: JsonObject? = null
        private set

    @Synchronized
    private fun send(ns: String, dest: String, payload: JsonObject) {
        out.write(CastProtocol.encode(CastMessage(SENDER, dest, ns, payload.toString())))
        out.flush()
    }

    private fun obj(vararg pairs: Pair<String, Any?>): JsonObject = buildJsonObject {
        for ((k, v) in pairs) when (v) {
            null -> {}
            is String -> put(k, v)
            is Number -> put(k, v)
            is Boolean -> put(k, v)
            is JsonElement -> put(k, v)
            else -> put(k, v.toString())
        }
    }

    private fun request(ns: String, dest: String, payload: JsonObject, timeoutMs: Long = 15000): JsonObject {
        val id = ids.getAndIncrement()
        val q = ArrayBlockingQueue<JsonObject>(1)
        waiting[id] = q
        try {
            send(ns, dest, JsonObject(payload + ("requestId" to JsonPrimitive(id))))
            return q.poll(timeoutMs, TimeUnit.MILLISECONDS) ?: throw IllegalStateException("The TV did not answer")
        } finally {
            waiting.remove(id)
        }
    }

    fun connect() {
        socket = connectSocket()
        out = socket.getOutputStream()
        val input = DataInputStream(socket.getInputStream())
        Thread({
            try {
                while (!closed) {
                    val len = input.readInt()
                    if (len <= 0 || len > 4_000_000) throw IllegalStateException("bad frame")
                    val b = ByteArray(len); input.readFully(b)
                    onMessage(CastProtocol.decode(b))
                }
            } catch (_: Throwable) {
                closed = true
            }
        }, "cast-read").apply { isDaemon = true }.start()
        Thread({
            while (!closed) {
                try { Thread.sleep(5000); if (!closed) send(CastProtocol.HEARTBEAT, RECEIVER_ID, obj("type" to "PING")) } catch (_: Throwable) {}
            }
        }, "cast-ping").apply { isDaemon = true }.start()
        send(CastProtocol.CONNECTION, RECEIVER_ID, obj("type" to "CONNECT"))
    }

    private fun onMessage(m: CastMessage) {
        val p = runCatching { json.parseToJsonElement(m.payload).jsonObject }.getOrNull() ?: return
        val type = p["type"]?.jsonPrimitive?.content
        if (m.namespace == CastProtocol.HEARTBEAT && type == "PING") {
            runCatching { send(CastProtocol.HEARTBEAT, m.source, obj("type" to "PONG")) }
            return
        }
        if (type == "MEDIA_STATUS") {
            val st = p["status"]?.jsonArray?.firstOrNull()?.jsonObject
            if (st != null) {
                lastMediaStatus = st
                st["mediaSessionId"]?.jsonPrimitive?.intOrNull?.let { mediaSessionId = it }
            }
        }
        if (type == "CLOSE" && m.source == transportId) closed = true
        val id = p["requestId"]?.jsonPrimitive?.intOrNull ?: return
        waiting[id]?.offer(p)
    }

    /** Opens the Default Media Receiver (or reuses it) and connects to it. */
    fun launch() {
        val r = request(CastProtocol.RECEIVER, RECEIVER_ID, obj("type" to "LAUNCH", "appId" to CastProtocol.DEFAULT_MEDIA_RECEIVER), 30000)
        if (r["type"]?.jsonPrimitive?.content == "LAUNCH_ERROR") throw IllegalStateException("The TV refused to open the player: " + (r["reason"]?.jsonPrimitive?.content ?: "?"))
        val app = r["status"]?.jsonObject?.get("applications")?.jsonArray
            ?.map { it.jsonObject }?.firstOrNull { it["appId"]?.jsonPrimitive?.content == CastProtocol.DEFAULT_MEDIA_RECEIVER }
            ?: throw IllegalStateException("The TV did not open the player")
        val t = app["transportId"]!!.jsonPrimitive.content
        transportId = t
        send(CastProtocol.CONNECTION, t, obj("type" to "CONNECT"))
    }

    data class Track(val url: String, val lang: String, val label: String)

    fun load(url: String, contentType: String, title: String, startAt: Double, tracks: List<Track>) {
        val t = transportId ?: throw IllegalStateException("Not connected")
        val media = buildJsonObject {
            put("contentId", url)
            put("contentType", contentType)
            put("streamType", "BUFFERED")
            put("metadata", buildJsonObject { put("type", 0); put("metadataType", 0); put("title", title) })
            if (tracks.isNotEmpty()) {
                put("tracks", buildJsonArray {
                    tracks.forEachIndexed { i, s ->
                        add(buildJsonObject {
                            put("trackId", i + 1); put("type", "TEXT"); put("trackContentId", s.url)
                            put("trackContentType", "text/vtt"); put("name", s.label.ifBlank { "Subtitles" })
                            put("language", s.lang); put("subtype", "SUBTITLES")
                        })
                    }
                })
                put("textTrackStyle", buildJsonObject { put("backgroundColor", "#00000000"); put("edgeType", "OUTLINE"); put("edgeColor", "#000000FF") })
            }
        }
        val r = request(CastProtocol.MEDIA, t, obj(
            "type" to "LOAD", "media" to media, "autoplay" to true, "currentTime" to startAt,
            "activeTrackIds" to buildJsonArray { if (tracks.isNotEmpty()) add(JsonPrimitive(1)) },
        ), 30000)
        val type = r["type"]?.jsonPrimitive?.content
        if (type == "LOAD_FAILED" || type == "LOAD_CANCELLED" || type == "INVALID_REQUEST") throw IllegalStateException("The TV could not play this video ($type)")
    }

    private fun media(type: String, vararg extra: Pair<String, Any?>) {
        val t = transportId ?: throw IllegalStateException("Not connected")
        val sid = mediaSessionId ?: throw IllegalStateException("Nothing is playing on the TV")
        request(CastProtocol.MEDIA, t, obj("type" to type, "mediaSessionId" to sid, *extra))
    }

    fun play() = media("PLAY")
    fun pause() = media("PAUSE")
    fun seek(t: Double) = media("SEEK", "currentTime" to t)
    fun stop() = runCatching { media("STOP") }

    fun volume(level: Double) {
        request(CastProtocol.RECEIVER, RECEIVER_ID, obj("type" to "SET_VOLUME", "volume" to buildJsonObject { put("level", level) }))
    }

    /** time, duration, playing, state */
    fun status(): Triple<Double, Double, String> {
        val t = transportId ?: throw IllegalStateException("Not connected")
        val r = request(CastProtocol.MEDIA, t, obj("type" to "GET_STATUS"))
        val st = r["status"]?.jsonArray?.firstOrNull()?.jsonObject ?: lastMediaStatus
        st?.get("mediaSessionId")?.jsonPrimitive?.intOrNull?.let { mediaSessionId = it }
        val time = st?.get("currentTime")?.jsonPrimitive?.doubleOrNull ?: 0.0
        val dur = st?.get("media")?.jsonObject?.get("duration")?.jsonPrimitive?.doubleOrNull ?: 0.0
        val state = st?.get("playerState")?.jsonPrimitive?.content ?: ""
        return Triple(time, dur, state)
    }

    val isClosed get() = closed

    override fun close() {
        closed = true
        runCatching { transportId?.let { send(CastProtocol.CONNECTION, it, obj("type" to "CLOSE")) } }
        runCatching { socket.close() }
    }
}
