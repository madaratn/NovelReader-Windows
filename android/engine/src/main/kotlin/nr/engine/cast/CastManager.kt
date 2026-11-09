package nr.engine.cast

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@Serializable data class CastStatus(val time: Double, val duration: Double, val playing: Boolean, val state: String)
@Serializable data class CastDeviceDto(val id: String, val name: String, val kind: String, val host: String)
@Serializable data class CastSubtitle(val url: String = "", val lang: String = "", val label: String = "")
@Serializable data class CastStartRequest(val deviceId: String, val url: String, val title: String = "", val startAt: Double = 0.0, val subtitles: List<CastSubtitle> = emptyList())
@Serializable data class CastStartResult(val device: CastDeviceDto, val url: String)
@Serializable data class CastControlRequest(val action: String, val value: Double? = null)

interface TvPlayer {
    fun load(url: String, title: String, mime: String, startAt: Double, subtitles: List<CastV2Client.Track>)
    fun play(); fun pause(); fun stop(); fun seek(t: Double); fun volume(v: Double)
    fun status(): CastStatus
    fun close()
}

class ChromecastPlayer(private val d: TvDevice) : TvPlayer {
    private var client: CastV2Client? = null
    private fun c() = client?.takeIf { !it.isClosed } ?: throw IllegalStateException("Not connected")
    override fun load(url: String, title: String, mime: String, startAt: Double, subtitles: List<CastV2Client.Track>) {
        client?.close()
        val cl = CastV2Client(d.host, if (d.port > 0) d.port else 8009)
        client = cl
        cl.connect(); cl.launch(); cl.load(url, mime, title, startAt, subtitles)
    }
    override fun play() = c().play()
    override fun pause() = c().pause()
    override fun stop() { client?.stop() }
    override fun seek(t: Double) = c().seek(t)
    override fun volume(v: Double) = c().volume(v)
    override fun status(): CastStatus {
        val (t, dur, st) = c().status()
        return CastStatus(t, dur, st == "PLAYING" || st == "BUFFERING", st.lowercase())
    }
    override fun close() { client?.close(); client = null }
}

fun mimeOf(url: String): String {
    val u = runCatching { java.net.URLDecoder.decode(url, "UTF-8") }.getOrDefault(url)
    return when {
        Regex("/api/v1/hls\\?|\\.m3u8", RegexOption.IGNORE_CASE).containsMatchIn(url) -> "application/x-mpegURL"
        Regex("\\.mkv(\\?|$|&)", RegexOption.IGNORE_CASE).containsMatchIn(u) -> "video/x-matroska"
        Regex("\\.webm(\\?|$|&)", RegexOption.IGNORE_CASE).containsMatchIn(u) -> "video/webm"
        else -> "video/mp4"
    }
}

/** IPv4 of this phone on the TV's network (same first three numbers when possible). */
fun lanAddress(near: String = ""): String {
    val all = NetworkInterface.getNetworkInterfaces().toList().filter { runCatching { it.isUp && !it.isLoopback }.getOrDefault(false) }
        .flatMap { it.inetAddresses.toList() }.filterIsInstance<Inet4Address>().map { it.hostAddress ?: "" }.filter { it.isNotBlank() }
    val prefix = near.split(".").take(3).joinToString(".") + "."
    return all.firstOrNull { near.isNotBlank() && it.startsWith(prefix) }
        ?: all.firstOrNull { Regex("^(192\\.168|10\\.|172\\.(1[6-9]|2\\d|3[01]))").containsMatchIn(it) }
        ?: all.firstOrNull() ?: "127.0.0.1"
}

/** The PC's createCast (electron/cast.cjs), on the phone. */
class CastManager(private val context: Context, private val http: OkHttpClient) {
    private var devices = ConcurrentHashMap<String, TvDevice>()
    private var current: TvPlayer? = null
    private var currentDevice: String? = null
    val relay = CastRelay(http)

    @Volatile var lastScan: String = ""
        private set

    fun scan(timeoutMs: Long = 6000): List<CastDeviceDto> {
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val lock = runCatching { wifi?.createMulticastLock("nr-cast")?.apply { setReferenceCounted(false); acquire() } }.getOrNull()
        val found = ConcurrentHashMap<String, TvDevice>()
        val log = java.util.Collections.synchronizedList(ArrayList<String>())
        log.add("Wi-Fi: " + (wifiInterface()?.name ?: "?") + " " + (wifiAddress() ?: "no address") + (if (lock?.isHeld == true) "" else " (no multicast lock)"))
        fun add(d: TvDevice) {
            // The same TV can answer on several protocols: one entry per address and kind.
            synchronized(found) {
                val same = found.entries.firstOrNull { it.value.kind == d.kind && it.value.host == d.host }
                // A real name beats "TV (ip)" from the direct probe.
                if (same == null) found[d.id] = d else if (same.value.name.startsWith("TV (") && !d.name.startsWith("TV (")) { found.remove(same.key); found[d.id] = d }
            }
        }
        try {
            val locations = ConcurrentHashMap.newKeySet<String>()
            val threads = listOf(
                Thread { runCatching { Dlna.ssdpSearch(timeoutMs, { log.add(it) }) { locations.add(it) } }.onFailure { log.add("SSDP: $it") } },
                Thread { runCatching { nsdSearch(timeoutMs, { log.add(it) }) { add(it) } }.onFailure { log.add("Android mDNS: $it") } },
                Thread { runCatching { Mdns.search(timeoutMs, { log.add(it) }) { add(it) } }.onFailure { log.add("mDNS: $it") } },
                Thread { runCatching { CastProbe.scan(wifiAddress() ?: "", http, { log.add(it) }) { add(it) } }.onFailure { log.add("direct: $it") } },
            ).onEach { it.start() }
            threads[0].join(timeoutMs + 2000)
            locations.map { loc ->
                Thread {
                    runCatching {
                        http.newCall(Request.Builder().url(loc).build()).execute().use { r -> Dlna.parseDescription(r.body.string(), loc) }
                    }.onSuccess { d -> if (d != null) add(d) else log.add("not a TV player: $loc") }.onFailure { log.add("description $loc: $it") }
                }.apply { start() }
            }.forEach { it.join(5000) }
            threads.drop(1).forEach { it.join(timeoutMs + 4000) }
        } finally { runCatching { lock?.release() } }
        devices = found
        log.add("TVs: " + found.values.joinToString { it.name + " (" + it.kind + " " + it.host + ")" }.ifBlank { "none" })
        lastScan = log.joinToString(" · ")
        println("[miwayomi] cast scan: $lastScan")
        return found.values.map { CastDeviceDto(it.id, it.name, it.kind, it.host) }.sortedBy { it.name }
    }

    /** Chromecasts through Android's own mDNS (NsdManager). Resolves one at a time. */
    private fun nsdSearch(timeoutMs: Long, log: (String) -> Unit, onDevice: (TvDevice) -> Unit) {
        val nsd = context.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return
        val toResolve = java.util.concurrent.LinkedBlockingQueue<NsdServiceInfo>()
        val listener = object : NsdManager.DiscoveryListener {
            override fun onStartDiscoveryFailed(t: String?, e: Int) { log("Android mDNS failed to start ($e)") }
            override fun onStopDiscoveryFailed(t: String?, e: Int) {}
            override fun onDiscoveryStarted(t: String?) {}
            override fun onDiscoveryStopped(t: String?) {}
            override fun onServiceFound(info: NsdServiceInfo) { toResolve.add(info) }
            override fun onServiceLost(info: NsdServiceInfo) {}
        }
        nsd.discoverServices("_googlecast._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
        val end = System.currentTimeMillis() + timeoutMs
        val seen = HashSet<String>()
        var services = 0
        try {
            while (System.currentTimeMillis() < end + 1500) {
                val info = toResolve.poll(200, TimeUnit.MILLISECONDS) ?: continue
                if (!seen.add(info.serviceName)) continue
                services++
                val done = CountDownLatch(1)
                @Suppress("DEPRECATION")
                nsd.resolveService(info, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(i: NsdServiceInfo?, e: Int) { log("Android mDNS: could not resolve ${i?.serviceName} ($e)"); done.countDown() }
                    override fun onServiceResolved(i: NsdServiceInfo) {
                        runCatching {
                            @Suppress("DEPRECATION")
                            val ip = i.host?.hostAddress ?: return@runCatching
                            val attrs = i.attributes.mapValues { (_, v) -> v?.toString(Charsets.UTF_8) ?: "" }
                            onDevice(TvDevice("cast", "cast:" + (attrs["id"]?.ifBlank { null } ?: ip), attrs["fn"]?.ifBlank { null } ?: i.serviceName, ip, i.port))
                        }
                        done.countDown()
                    }
                })
                done.await(3, TimeUnit.SECONDS)
            }
        } finally { runCatching { nsd.stopServiceDiscovery(listener) }; log("Android mDNS: $services services") }
    }

    @Synchronized
    fun start(r: CastStartRequest): CastStartResult {
        val d = devices[r.deviceId] ?: throw IllegalStateException("This TV is no longer found. Search again.")
        relay.start()
        val host = lanAddress(d.host)
        val lanUrl = relay.toLan(r.url, host)
        val subs = r.subtitles.filter { it.url.isNotBlank() }.map { CastV2Client.Track(relay.toLan(it.url, host), it.lang, it.label) }
        if (current != null && currentDevice != r.deviceId) { runCatching { current?.stop() }; current?.close(); current = null }
        val player = current ?: (if (d.kind == "cast") ChromecastPlayer(d) else DlnaPlayer(d, http)).also { current = it; currentDevice = r.deviceId }
        player.load(lanUrl, r.title.ifBlank { "NovelReader" }, mimeOf(r.url), r.startAt, subs)
        return CastStartResult(CastDeviceDto(d.id, d.name, d.kind, d.host), lanUrl)
    }

    private fun need() = current ?: throw IllegalStateException("Nothing is being cast")

    fun control(c: CastControlRequest) {
        val p = need()
        when (c.action) {
            "play" -> p.play()
            "pause" -> p.pause()
            "seek" -> p.seek(c.value ?: 0.0)
            "volume" -> p.volume((c.value ?: 0.5).coerceIn(0.0, 1.0))
            else -> throw IllegalStateException("Unknown action")
        }
    }

    fun status(): CastStatus? = current?.status()

    @Synchronized
    fun stop() {
        val p = current ?: return
        runCatching { p.stop() }
        p.close(); current = null; currentDevice = null
    }
}
