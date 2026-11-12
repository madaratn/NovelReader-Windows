package miwayomi.extension

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import dalvik.system.DexClassLoader
import eu.kanade.tachiyomi.animesource.AnimeSource
import eu.kanade.tachiyomi.animesource.AnimeSourceFactory
import eu.kanade.tachiyomi.source.MangaSource
import eu.kanade.tachiyomi.source.SourceFactory
import miwayomi.source.AnimeSourceManager
import miwayomi.source.MangaSourceManager
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Android version of Miwayomi's extension manager: an extension is an Android APK,
 * so it is loaded as it is (DexClassLoader), like Aniyomi does - no dex2jar, no
 * bytecode repair. Same public API as the PC one, which the HTTP routes use.
 */
class ExtensionManager(
    private val context: Context,
    private val extensionsDir: File,
    private val mangaSourceManager: MangaSourceManager,
    private val animeSourceManager: AnimeSourceManager,
) {
    data class LoadedExtension(
        val meta: ExtensionMeta,
        val apk: File,
        val jar: File,
        val classLoader: ClassLoader,
        val manga: Int,
        val anime: Int,
        val sources: List<Any> = emptyList(),
    )

    private val extensions = ConcurrentHashMap<String, LoadedExtension>()
    private val sourceOwner = ConcurrentHashMap<Long, String>()
    private val registry = Any()

    val loaded: List<LoadedExtension> get() = extensions.values.toList()

    fun pkgOf(sourceId: Long): String? = sourceOwner[sourceId]

    /**
     * Loads every installed extension, four at a time: opening an extension (its code,
     * its classes) is what takes the time at start, and each one is independent. The
     * list of sources is the same as before, in the same state when this returns.
     */
    fun loadAll(): Int {
        extensionsDir.mkdirs()
        val apks = extensionsDir.listFiles { f -> f.isFile && f.extension.equals("apk", true) }?.sortedBy { it.name }.orEmpty()
        if (apks.isEmpty()) return 0
        val t0 = System.currentTimeMillis()
        val ok = java.util.concurrent.atomic.AtomicInteger(0)
        val pool = java.util.concurrent.Executors.newFixedThreadPool(minOf(4, apks.size))
        try {
            apks.map { apk ->
                pool.submit {
                    try {
                        load(apk); ok.incrementAndGet()
                    } catch (e: Throwable) {
                        println("[miwayomi] Error loading $apk: $e")
                    }
                }
            }.forEach { runCatching { it.get() } }
        } finally { pool.shutdown() }
        println("[miwayomi] ${ok.get()} of ${apks.size} extension(s) opened in ${System.currentTimeMillis() - t0} ms")
        return ok.get()
    }

    private fun parseMeta(apk: File): ExtensionMeta? {
        val pm = context.packageManager
        @Suppress("DEPRECATION")
        val info = pm.getPackageArchiveInfo(apk.absolutePath, PackageManager.GET_META_DATA) ?: return null
        val md = info.applicationInfo?.metaData ?: return null
        fun str(k: String) = md.get(k)?.toString()?.takeIf { it.isNotBlank() }
        val animeClass = str("tachiyomi.animeextension.class")
        val isAnime = animeClass != null
        val classes = (animeClass ?: str("tachiyomi.extension.class"))
            ?.split(";")?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty()
        val factory = if (isAnime) str("tachiyomi.animeextension.factory") else str("tachiyomi.extension.factory")
        val nsfw = (if (isAnime) str("tachiyomi.animeextension.nsfw") else str("tachiyomi.extension.nsfw")) == "1"
        val pkg = info.packageName
        @Suppress("DEPRECATION")
        val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
        val label = info.applicationInfo?.let { ai ->
            ai.sourceDir = apk.absolutePath; ai.publicSourceDir = apk.absolutePath
            runCatching { pm.getApplicationLabel(ai).toString() }.getOrNull()
        }
        return ExtensionMeta(
            pkgName = pkg,
            versionName = info.versionName ?: "0",
            versionCode = code,
            isNsfw = nsfw,
            isAnime = isAnime,
            sourceClasses = classes,
            factoryClass = factory,
            name = (str("tachiyomi.extension.name") ?: label ?: pkg.substringAfterLast('.'))
                .removePrefix("Aniyomi: ").removePrefix("Tachiyomi: "),
        )
    }

    private fun resolve(className: String, pkg: String) = if (className.startsWith(".")) pkg + className else className

    fun load(apk: File): LoadedExtension {
        val meta = parseMeta(apk) ?: throw IllegalStateException("Could not read manifest of ${apk.name}")
        synchronized(registry) { extensions[meta.pkgName]?.let { unregister(it) } }
        // Android 14+ only loads code from read-only files.
        apk.setReadOnly()
        // Parent first, like the PC engine: the app's Aniyomi API, Kotlin, OkHttp… win,
        // the extension only brings what the app does not have. (Some extensions ship
        // their own copy of Kotlin; loading theirs first breaks with a LinkageError.)
        val loader = DexClassLoader(apk.absolutePath, File(context.codeCacheDir, "ext").apply { mkdirs() }.absolutePath, null, ExtensionManager::class.java.classLoader!!)
        val instances = mutableListOf<Any>()
        fun create(fqcn: String) {
            try {
                when (val o = Class.forName(fqcn, false, loader).getDeclaredConstructor().newInstance()) {
                    is SourceFactory -> instances.addAll(o.createSources())
                    is AnimeSourceFactory -> instances.addAll(o.createSources())
                    else -> instances.add(o)
                }
            } catch (e: Throwable) {
                var c: Throwable = e
                while (c is java.lang.reflect.InvocationTargetException && c.cause != null) c = c.cause!!
                println("[miwayomi] Error instantiating $fqcn: $c")
            }
        }
        meta.sourceClasses.forEach { create(resolve(it, meta.pkgName)) }
        if (instances.isEmpty() && meta.factoryClass != null) create(resolve(meta.factoryClass, meta.pkgName))
        var manga = 0
        var anime = 0
        val registered = mutableListOf<Any>()
        // The shared lists of sources: one extension at a time (loadAll opens several at once).
        synchronized(registry) {
            for (o in instances) when (o) {
                is MangaSource -> { mangaSourceManager.register(o); sourceOwner[o.id] = meta.pkgName; registered.add(o); manga++ }
                is AnimeSource -> { animeSourceManager.register(o); sourceOwner[o.id] = meta.pkgName; registered.add(o); anime++ }
            }
        }
        if (registered.isEmpty()) throw IllegalStateException("No source could be created from ${apk.name}")
        val ext = LoadedExtension(meta, apk, apk, loader, manga, anime, registered)
        extensions[meta.pkgName] = ext
        println("[miwayomi] Extension loaded: ${meta.name} (${meta.pkgName}) - anime: $anime, manga: $manga")
        return ext
    }

    private fun unregister(ext: LoadedExtension) {
        for (s in ext.sources) when (s) {
            is MangaSource -> { mangaSourceManager.unregister(s); sourceOwner.remove(s.id) }
            is AnimeSource -> { animeSourceManager.unregister(s); sourceOwner.remove(s.id) }
        }
    }

    fun uninstall(pkg: String): LoadedExtension? {
        val ext = extensions.remove(pkg) ?: return null
        runCatching { unregister(ext) }
        runCatching { ext.apk.setWritable(true); ext.apk.delete() }
        return ext
    }
}
