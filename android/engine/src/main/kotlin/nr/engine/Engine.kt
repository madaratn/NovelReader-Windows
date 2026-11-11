package nr.engine

import android.app.Application
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.network.NetworkPreferences
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import kotlinx.serialization.json.Json
import miwayomi.ServerConfig
import miwayomi.api.registerApi
import miwayomi.api.syncExtensionRegistry
import miwayomi.di.ConfigHolder
import miwayomi.extension.ExtensionManager
import miwayomi.source.AnimeSourceManager
import miwayomi.source.MangaSourceManager
import tachiyomi.core.common.preference.InMemoryPreferenceStore
import tachiyomi.core.common.preference.PreferenceStore
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.InjektModule
import uy.kohesive.injekt.api.InjektRegistrar
import uy.kohesive.injekt.api.addSingleton
import uy.kohesive.injekt.api.addSingletonFactory
import uy.kohesive.injekt.api.get
import java.io.File

/**
 * The video engine inside the app: the same HTTP API as the PC engine
 * (http://127.0.0.1:4567/api/v1/...), so the interface works unchanged.
 */
object Engine {
    const val PORT = 4567
    @Volatile var state: String = "stopped"
    /** Called when video downloads start (true) and when the last one ends (false). */
    @Volatile var onDownloadsActive: java.util.function.Consumer<Boolean>? = null
        private set
    @Volatile var error: String? = null
        private set
    private var server: EmbeddedServer<*, *>? = null

    @Synchronized
    fun start(app: Application) {
        if (server != null || state == "starting") return
        state = "starting"
        Thread({
            try {
                run(app)
                state = "running"
            } catch (e: Throwable) {
                error = e.toString()
                state = "failed"
                println("[miwayomi] engine failed to start: $e")
                e.printStackTrace()
            }
        }, "nr-engine").start()
    }

    private fun run(app: Application) {
        rx.plugins.RxJavaHooks.setOnError { e ->
            val root = generateSequence(e) { it.cause }.lastOrNull() ?: e
            println("[miwayomi] RxJava extension error: " + root.javaClass.simpleName + ": " + root.message)
        }
        val data = File(app.filesDir, "miwayomi").apply { mkdirs() }
        CompatRuntime.baseDir = data
        CompatRuntime.cacheDir = app.cacheDir
        // Cloudflare: the FlareSolverr API served by the app (hidden WebView), like FlareSolverr on the PC.
        nr.engine.cf.FlareSolverrServer.start(app)
        val flare = "http://127.0.0.1:" + nr.engine.cf.FlareSolverrServer.PORT
        val config = ServerConfig(host = "127.0.0.1", port = PORT, dataDir = data, flareSolverrUrl = flare, openBrowser = false)
        ConfigHolder.config = config
        Injekt.importModule(object : InjektModule {
            override fun InjektRegistrar.registerInjectables() {
                addSingleton<Application>(app)
                addSingleton<android.content.Context>(app)
                addSingletonFactory<PreferenceStore> { InMemoryPreferenceStore() }
                addSingletonFactory { NetworkPreferences(get()) }
                addSingletonFactory { NetworkHelper(app, get(), flare) }
                addSingletonFactory { Json { ignoreUnknownKeys = true; explicitNulls = false } }
                addSingletonFactory { MangaSourceManager() }
                addSingletonFactory { AnimeSourceManager() }
                addSingletonFactory { ExtensionManager(app, config.extensionsDir, get(), get()) }
                // Cast: plain client (the engine's has interceptors for the sources).
                // Offline videos: kept in the app's own storage, fetched through the engine's stream relay.
                addSingletonFactory {
                    nr.engine.dl.VideoDownloads(
                        File(app.getExternalFilesDir(null) ?: app.filesDir, "video-downloads"),
                        okhttp3.OkHttpClient.Builder().readTimeout(java.time.Duration.ofSeconds(60)).build(),
                    ) { active -> onDownloadsActive?.accept(active) }
                }
                addSingletonFactory { nr.engine.cast.CastManager(app, okhttp3.OkHttpClient.Builder().readTimeout(java.time.Duration.ofSeconds(60)).build()) }
            }
        })
        val ext = Injekt.get<ExtensionManager>()
        println("[miwayomi] ${ext.loadAll()} extension(s) loaded")
        syncExtensionRegistry(ext)
        server = embeddedServer(CIO, port = PORT, host = "127.0.0.1") { registerApi() }.also { it.start(wait = false) }
        println("[miwayomi] engine running at http://127.0.0.1:$PORT")
    }
}
