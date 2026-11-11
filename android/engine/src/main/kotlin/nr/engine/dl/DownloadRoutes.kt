package nr.engine.dl

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytesWriter
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import java.io.RandomAccessFile

@Serializable data class DlOk(val ok: Boolean = true)
@Serializable data class DlVersion(val version: Long)
@Serializable data class DlFail(val error: String)

/** "bytes=a-b" for a file of [size] bytes: first and last byte, or null when it cannot be served. */
fun parseRange(header: String?, size: Long): Pair<Long, Long>? {
    val m = Regex("bytes=(\\d*)-(\\d*)").find(header ?: "") ?: return null
    val a = m.groupValues[1]; val b = m.groupValues[2]
    if (a.isEmpty() && b.isEmpty()) return null
    var s = if (a.isEmpty()) maxOf(0, size - b.toLong()) else a.toLong()
    var e = if (a.isEmpty() || b.isEmpty()) size - 1 else minOf(b.toLong(), size - 1)
    if (s > e) { s = -1; e = -1 }
    return s to e
}

/** Offline video downloads for the interface (window.novelReader.dl* on Android). */
fun Application.registerDownloadApi() {
    val dl by lazy { Injekt.get<VideoDownloads>() }
    routing {
        post("/api/v1/dl/start") {
            val p = call.receive<DlStart>()
            try { call.respond(dl.start(p)) } catch (e: DlError) { call.respond(HttpStatusCode.BadRequest, DlFail(e.message ?: "error")) }
        }
        get("/api/v1/dl/list") { call.respond(withContext(Dispatchers.IO) { dl.list() }) }
        get("/api/v1/dl/version") { call.respond(DlVersion(dl.version)) }
        get("/api/v1/dl/usage") { call.respond(withContext(Dispatchers.IO) { dl.usage() }) }
        post("/api/v1/dl/cancel") { dl.cancel(call.receive<DlId>().id); call.respond(DlOk()) }
        post("/api/v1/dl/remove") { val id = call.receive<DlId>().id; withContext(Dispatchers.IO) { dl.remove(id) }; call.respond(DlOk()) }
        post("/api/v1/dl/clear") { withContext(Dispatchers.IO) { dl.clear() }; call.respond(DlOk()) }
        post("/api/v1/dl/configure") { val s = call.receive<DlSettings>(); dl.settings = DlSettings(maxOf(0, s.maxHeight), maxOf(0, s.limit)); call.respond(dl.settings) }
        // A finished download, for <video> and hls.js (byte ranges).
        get("/api/v1/dl/file/{path...}") {
            val rel = call.parameters.getAll("path")?.joinToString("/") ?: ""
            val f = withContext(Dispatchers.IO) { dl.fileFor(rel) }
            if (f == null) { call.respondText("Not found", status = HttpStatusCode.NotFound); return@get }
            val size = f.length()
            val range = parseRange(call.request.headers[HttpHeaders.Range], size)
            call.response.header(HttpHeaders.AcceptRanges, "bytes")
            if (range != null && range.first < 0) {
                call.response.header(HttpHeaders.ContentRange, "bytes */$size")
                call.respondText("", status = HttpStatusCode.RequestedRangeNotSatisfiable); return@get
            }
            val s = range?.first ?: 0L
            val e = range?.second ?: (size - 1)
            if (range != null) call.response.header(HttpHeaders.ContentRange, "bytes $s-$e/$size")
            call.respondBytesWriter(ContentType.parse(VideoDownloads.contentType(f.name)), if (range != null) HttpStatusCode.PartialContent else HttpStatusCode.OK, e - s + 1) {
                withContext(Dispatchers.IO) {
                    RandomAccessFile(f, "r").use { raf ->
                        raf.seek(s)
                        val buf = ByteArray(256 * 1024)
                        var left = e - s + 1
                        while (left > 0) {
                            val n = raf.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
                            if (n < 0) break
                            writeFully(buf, 0, n)
                            left -= n
                        }
                    }
                }
            }
        }
    }
}
