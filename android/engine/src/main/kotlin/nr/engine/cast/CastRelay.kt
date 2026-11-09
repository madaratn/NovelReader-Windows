package nr.engine.cast

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.autohead.AutoHeadResponse
import io.ktor.server.request.header
import io.ktor.server.request.uri
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondOutputStream
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.options
import io.ktor.server.routing.routing
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.ServerSocket
import java.net.URI
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/**
 * The TV cannot reach the engine (it listens only inside the phone), so this relay
 * listens on the Wi-Fi and forwards: /t/<token>/<port>/<path> -> http://127.0.0.1:<port>/<path>.
 * Only the ports of the videos being cast, behind a random token; HLS playlists are
 * rewritten to go through it too. Same as the relay of electron/cast.cjs.
 */
class CastRelay(private val http: OkHttpClient) {
    val token: String = ByteArray(12).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    private val ports = ConcurrentHashMap.newKeySet<Int>()
    @Volatile var port = 0
        private set
    private var server: EmbeddedServer<*, *>? = null

    private fun base(host: String) = "http://$host:$port/t/$token/"

    fun toLan(url: String, host: String): String {
        val u = runCatching { URI(url) }.getOrNull() ?: return url
        if (u.host != "127.0.0.1" && u.host != "localhost") return url
        val p = if (u.port > 0) u.port else 80
        ports.add(p)
        return base(host) + p + (u.rawPath ?: "") + (u.rawQuery?.let { "?$it" } ?: "")
    }

    /** Local addresses inside a playlist -> through the relay. */
    fun rewritePlaylist(body: String, host: String): String =
        Regex("http://(?:127\\.0\\.0\\.1|localhost):(\\d+)/").replace(body) { m -> ports.add(m.groupValues[1].toInt()); base(host) + m.groupValues[1] + "/" }

    @Synchronized
    fun start() {
        if (server != null) return
        port = (4570..4590).firstOrNull { p -> runCatching { ServerSocket(p).close() }.isSuccess } ?: 0
        if (port == 0) port = ServerSocket(0).use { it.localPort }
        val re = Regex("^/t/([0-9a-f]+)/(\\d+)(/.*)$")
        server = embeddedServer(CIO, port = port, host = "0.0.0.0") {
            install(AutoHeadResponse)
            routing {
                options("{...}") { call.response.header("Access-Control-Allow-Origin", "*"); call.response.header("Access-Control-Allow-Headers", "*"); call.respond(HttpStatusCode.NoContent) }
                get("{...}") {
                    call.response.header("Access-Control-Allow-Origin", "*")
                    val m = re.find(call.request.uri)
                    if (m == null || m.groupValues[1] != token || !ports.contains(m.groupValues[2].toInt())) { call.respond(HttpStatusCode.NotFound); return@get }
                    val path = m.groupValues[3]
                    val req = Request.Builder().url("http://127.0.0.1:${m.groupValues[2]}$path")
                    call.request.header("Range")?.let { req.header("Range", it) }
                    val r = try { http.newCall(req.build()).execute() } catch (e: Exception) { call.respond(HttpStatusCode.BadGateway); return@get }
                    r.use { resp ->
                        val type = resp.header("Content-Type") ?: "application/octet-stream"
                        val isList = Regex("mpegurl", RegexOption.IGNORE_CASE).containsMatchIn(type) || Regex("\\.m3u8(\\?|$)", RegexOption.IGNORE_CASE).containsMatchIn(path)
                        if (isList) {
                            val host = (call.request.header("Host") ?: "").substringBefore(':').ifBlank { lanAddress() }
                            call.response.header("Cache-Control", "no-store")
                            call.respondText(rewritePlaylist(resp.body.string(), host), ContentType.parse("application/vnd.apple.mpegurl"), HttpStatusCode.fromValue(resp.code))
                            return@get
                        }
                        resp.header("Content-Range")?.let { call.response.header("Content-Range", it) }
                        val len = resp.header("Content-Length")?.toLongOrNull()
                        if (resp.header("Accept-Ranges") != null || len != null) call.response.header("Accept-Ranges", "bytes")
                        // DLNA TVs like these headers.
                        call.response.header("transferMode.dlna.org", "Streaming")
                        call.response.header("contentFeatures.dlna.org", "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000")
                        call.respondOutputStream(runCatching { ContentType.parse(type) }.getOrDefault(ContentType.Application.OctetStream), HttpStatusCode.fromValue(resp.code), len) {
                            resp.body.byteStream().use { it.copyTo(this, 65536) }
                        }
                    }
                }
            }
        }.also { it.start(wait = false) }
    }
}
