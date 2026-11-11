package miwayomi.api

import eu.kanade.tachiyomi.network.CloudflareChallengeException
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json
import miwayomi.extension.ExtensionManager
import nr.engine.cast.registerCastApi
import nr.engine.dl.registerDownloadApi
import miwayomi.source.AnimeSourceManager
import miwayomi.source.MangaSourceManager
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get

/** Android: the PC engine's routes (miwayomi/api/ApiRoutes.kt) without the web UI,
 * the self-update and the source settings pages, which the app does not use. */
fun Application.registerApi() {
    val mangaSources = Injekt.get<MangaSourceManager>()
    val animeSources = Injekt.get<AnimeSourceManager>()

    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true; explicitNulls = false })
    }
    intercept(ApplicationCallPipeline.Plugins) {
        call.response.header("Access-Control-Allow-Origin", "*")
    }
    install(StatusPages) {
        exception<CloudflareChallengeException> { call, cause ->
            println("[miwayomi] Cloudflare challenge at ${cause.url}")
            call.respond(
                HttpStatusCode.InternalServerError,
                ErrorDto(cause.message ?: "Cloudflare challenge", challengeUrl = cause.url, challengeUserAgent = cause.userAgent),
            )
        }
        exception<Throwable> { call, cause ->
            val root = generateSequence(cause) { it.cause }.lastOrNull() ?: cause
            println("[miwayomi] error: ${root.javaClass.simpleName}: ${root.message}")
            call.respond(HttpStatusCode.InternalServerError, ErrorDto(cause.message ?: cause::class.simpleName ?: "error"))
        }
    }

    routing {
        get("/") { call.respondText("miwayomi (NovelReader Android)") }
        get("/api/v1/health") {
            call.respond(HealthDto("ok", "miwayomi", mangaSources.all().size, animeSources.all().size))
        }
        get("/api/v1/sources") {
            val extensionManager = Injekt.get<ExtensionManager>()
            call.respond(
                SourcesListDto(
                    manga = mangaSources.all().map { it.toDto(extensionManager.pkgOf(it.id)) },
                    anime = animeSources.all().map { it.toDto(extensionManager.pkgOf(it.id)) },
                ),
            )
        }
    }

    registerMangaApi()
    registerAnimeApi()
    registerStreamingApi()
    registerExtensionApi()
    registerFavoritesApi()
    registerWatchApi()
    registerCastApi()
    registerDownloadApi()
}
