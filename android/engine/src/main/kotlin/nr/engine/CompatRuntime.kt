package nr.engine

import java.io.File

/** Stands in for Miwayomi's desktop runtime folders: the app's own folders. */
object CompatRuntime {
    @Volatile lateinit var baseDir: File
    @Volatile lateinit var cacheDir: File
}
