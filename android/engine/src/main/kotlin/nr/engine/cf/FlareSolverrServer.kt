package nr.engine.cf

import android.app.Application
import io.ktor.http.ContentType
import io.ktor.server.application.call
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * The FlareSolverr API (what the PC engine talks to at http://127.0.0.1:8191), served
 * inside the app and backed by [WebViewSolver]: the engine code stays the same.
 */
object FlareSolverrServer {
    const val PORT = 8191
    private var server: EmbeddedServer<*, *>? = null
    lateinit var solver: WebViewSolver
        private set

    fun answer(body: String): String {
        val req = Json.parseToJsonElement(body).jsonObject
        val cmd = req["cmd"]?.jsonPrimitive?.contentOrNull ?: ""
        fun ok(f: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) = buildJsonObject { put("status", "ok"); put("message", ""); f() }.toString()
        return when (cmd) {
            "sessions.create" -> ok { put("session", "android") }
            "sessions.destroy", "sessions.list" -> ok { }
            "request.get", "request.post" -> {
                val url = req["url"]?.jsonPrimitive?.contentOrNull ?: throw IllegalArgumentException("url missing")
                val headers = (req["headers"] as? JsonObject)?.mapValues { it.value.jsonPrimitive.contentOrNull ?: "" } ?: emptyMap()
                val r = solver.solve(url, if (cmd == "request.post") "POST" else "GET", req["postData"]?.jsonPrimitive?.contentOrNull, headers, 45000)
                // Cloudflare ties its cookie to the browser identity: the engine now uses
                // the WebView's for this site, so the next requests pass without a new check.
                runCatching { java.net.URI(url).host?.let { eu.kanade.tachiyomi.network.CfResolvedUa.set(it, r.userAgent) } }
                ok {
                    put("solution", buildJsonObject {
                        put("url", r.url); put("status", 200)
                        put("headers", buildJsonObject { put("Content-Type", r.contentType) })
                        put("response", r.html); put("userAgent", r.userAgent)
                        put("cookies", buildJsonArray {
                            r.cookies.forEach { (n, v, d) -> add(buildJsonObject { put("name", n); put("value", v); put("domain", d); put("path", "/"); put("httpOnly", false); put("secure", true) }) }
                        })
                    })
                }
            }
            else -> buildJsonObject { put("status", "error"); put("message", "unknown cmd $cmd") }.toString()
        }
    }

    @Synchronized
    fun start(app: Application) {
        if (server != null) return
        solver = WebViewSolver(app)
        server = embeddedServer(CIO, port = PORT, host = "127.0.0.1") {
            routing {
                get("/") { call.respondText("{\"msg\":\"FlareSolverr is ready!\",\"version\":\"android-webview\"}", ContentType.Application.Json) }
                post("/v1") {
                    val body = call.receiveText()
                    val out = withContext(Dispatchers.IO) {
                        runCatching { answer(body) }.getOrElse { e -> buildJsonObject { put("status", "error"); put("message", e.message ?: e.toString()) }.toString() }
                    }
                    call.respondText(out, ContentType.Application.Json)
                }
            }
        }.also { it.start(wait = false) }
        println("[miwayomi] Cloudflare solver (WebView) at http://127.0.0.1:$PORT")
    }
}
