package nr.engine.cast

import io.ktor.server.application.Application
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import io.ktor.http.ContentType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get

@Serializable data class OkDto(val ok: Boolean = true)

/** Cast for the interface (window.novelReader.cast* on Android). */
fun Application.registerCastApi() {
    val cast by lazy { Injekt.get<CastManager>() }
    routing {
        post("/api/v1/cast/scan") { call.respond(withContext(Dispatchers.IO) { cast.scan() }) }
        post("/api/v1/cast/start") {
            val r = call.receive<CastStartRequest>()
            call.respond(withContext(Dispatchers.IO) { cast.start(r) })
        }
        post("/api/v1/cast/control") {
            val r = call.receive<CastControlRequest>()
            withContext(Dispatchers.IO) { cast.control(r) }
            call.respond(OkDto())
        }
        get("/api/v1/cast/status") {
            val s = withContext(Dispatchers.IO) { cast.status() }
            if (s == null) call.respondText("null", ContentType.Application.Json) else call.respond(s)
        }
        get("/api/v1/cast/diag") { call.respondText(cast.lastScan, ContentType.Text.Plain) }
        post("/api/v1/cast/stop") { withContext(Dispatchers.IO) { cast.stop() }; call.respond(OkDto()) }
    }
}
