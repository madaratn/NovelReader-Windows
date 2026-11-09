package nr.engine.cast

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetSocketAddress
import java.net.Socket
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * When the network does not pass discovery messages (some routers, some TVs), find
 * Chromecasts / Google TVs directly: every address of the Wi-Fi network is tried on
 * the Cast port (8009), then the device is asked its name. A couple of seconds.
 */
object CastProbe {
    fun subnetHosts(own: String): List<String> {
        val p = own.split('.')
        if (p.size != 4) return emptyList()
        val base = p.take(3).joinToString(".")
        return (1..254).map { "$base.$it" }.filter { it != own }
    }

    fun portOpen(ip: String, port: Int, timeoutMs: Int): Boolean = try {
        Socket().use { it.connect(InetSocketAddress(ip, port), timeoutMs) }; true
    } catch (_: Exception) { false }

    /** Name from the device's info page ({"name": "..."}), on 8008 (http) or 8443 (https). */
    fun parseName(json: String): String? = runCatching { Json.parseToJsonElement(json).jsonObject["name"]?.jsonPrimitive?.content }.getOrNull()?.ifBlank { null }

    private val trustAll = object : X509TrustManager {
        override fun checkClientTrusted(c: Array<out X509Certificate>?, a: String?) {}
        override fun checkServerTrusted(c: Array<out X509Certificate>?, a: String?) {}
        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    }

    fun name(ip: String, http: OkHttpClient): String? {
        val quick = http.newBuilder().callTimeout(2, TimeUnit.SECONDS).connectTimeout(1, TimeUnit.SECONDS)
            .sslSocketFactory(SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustAll), SecureRandom()) }.socketFactory, trustAll)
            .hostnameVerifier { _, _ -> true }.build()
        for (u in listOf("http://$ip:8008/setup/eureka_info?params=name", "https://$ip:8443/setup/eureka_info?params=name")) {
            runCatching { quick.newCall(Request.Builder().url(u).build()).execute().use { r -> if (r.isSuccessful) parseName(r.body.string())?.let { return it } } }
        }
        return null
    }

    fun scan(own: String, http: OkHttpClient, log: (String) -> Unit, onDevice: (TvDevice) -> Unit) {
        val hosts = subnetHosts(own)
        if (hosts.isEmpty()) { log("direct: no Wi-Fi address"); return }
        val pool = Executors.newFixedThreadPool(64)
        val found = java.util.Collections.synchronizedList(ArrayList<String>())
        hosts.forEach { ip -> pool.execute { if (portOpen(ip, 8009, 600)) found.add(ip) } }
        pool.shutdown(); pool.awaitTermination(8, TimeUnit.SECONDS)
        log("direct: ${hosts.size} addresses, Cast port open on ${found.size}")
        found.map { ip -> Thread { onDevice(TvDevice("cast", "cast:ip:$ip", name(ip, http) ?: "TV ($ip)", ip, 8009)) }.apply { start() } }.forEach { it.join(4000) }
    }
}
