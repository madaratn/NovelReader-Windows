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
        val config = ServerConfig(host = "127.0.0.1", port = PORT, dataDir = data, flareSolverrUrl = null, openBrowser = false)
        ConfigHolder.config = config
        Injekt.importModule(object : InjektModule {
            override fun InjektRegistrar.registerInjectables() {
                addSingleton<Application>(app)
                addSingleton<android.content.Context>(app)
                addSingletonFactory<PreferenceStore> { InMemoryPreferenceStore() }
                addSingletonFactory { NetworkPreferences(get()) }
                addSingletonFactory { NetworkHelper(app, get(), null) }
                addSingletonFactory { Json { ignoreUnknownKeys = true; explicitNulls = false } }
                addSingletonFactory { MangaSourceManager() }
                addSingletonFactory { AnimeSourceManager() }
                addSingletonFactory { ExtensionManager(app, config.extensionsDir, get(), get()) }
            }
        })
        val ext = Injekt.get<ExtensionManager>()
        println("[miwayomi] ${ext.loadAll()} extension(s) loaded")
        syncExtensionRegistry(ext)
        server = embeddedServer(CIO, port = PORT, host = "127.0.0.1") { registerApi() }.also { it.start(wait = false) }
        println("[miwayomi] engine running at http://127.0.0.1:$PORT")
    }
}
