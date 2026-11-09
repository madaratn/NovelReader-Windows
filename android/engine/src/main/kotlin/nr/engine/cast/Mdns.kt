package nr.engine.cast

import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.SocketTimeoutException

/** The Wi-Fi interface (not mobile data): where TVs are. */
fun wifiInterface(): NetworkInterface? {
    val all = runCatching { NetworkInterface.getNetworkInterfaces().toList() }.getOrDefault(emptyList())
        .filter { runCatching { it.isUp && !it.isLoopback && it.supportsMulticast() }.getOrDefault(false) }
        .filter { it.inetAddresses.toList().any { a -> a is Inet4Address } }
    val private4 = { n: NetworkInterface -> n.inetAddresses.toList().filterIsInstance<Inet4Address>().any { a -> a.isSiteLocalAddress } }
    return all.firstOrNull { it.name.startsWith("wlan") && private4(it) }
        ?: all.firstOrNull { !it.name.startsWith("rmnet") && !it.name.startsWith("ccmni") && !it.name.startsWith("tun") && private4(it) }
        ?: all.firstOrNull { it.name.startsWith("wlan") }
}

fun wifiAddress(): String? = wifiInterface()?.inetAddresses?.toList()?.filterIsInstance<Inet4Address>()?.firstOrNull()?.hostAddress

/**
 * Finds Chromecasts / Google TVs with a plain mDNS query (RFC 6762 "legacy unicast":
 * sent from a normal port, answers come back to it), on the Wi-Fi interface. Used
 * with Android's NsdManager, which some phones make slow or silent.
 */
object Mdns {
    data class Record(val name: String, val type: Int, val data: Any)

    fun query(service: String): ByteArray {
        val out = ByteArrayOutputStream()
        out.write(byteArrayOf(0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0))
        for (label in service.trimEnd('.').split('.')) { val b = label.toByteArray(); out.write(b.size); out.write(b) }
        out.write(0)
        out.write(byteArrayOf(0, 12, 0x80.toByte(), 1)) // PTR, IN, unicast answer wanted
        return out.toByteArray()
    }

    private fun u16(b: ByteArray, i: Int) = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF)

    private fun readName(b: ByteArray, start: Int): Pair<String, Int> {
        val parts = ArrayList<String>()
        var i = start; var end = -1; var jumps = 0
        while (i < b.size) {
            val len = b[i].toInt() and 0xFF
            if (len == 0) { i++; break }
            if (len and 0xC0 == 0xC0) {
                if (end < 0) end = i + 2
                i = ((len and 0x3F) shl 8) or (b[i + 1].toInt() and 0xFF)
                if (++jumps > 20) break
                continue
            }
            parts.add(String(b, i + 1, len, Charsets.UTF_8)); i += 1 + len
        }
        return parts.joinToString(".") to (if (end >= 0) end else i)
    }

    /** All answer / authority / additional records of a response. */
    fun parse(b: ByteArray): List<Record> {
        if (b.size < 12) return emptyList()
        val qd = u16(b, 4); val n = u16(b, 6) + u16(b, 8) + u16(b, 10)
        var i = 12
        repeat(qd) { i = readName(b, i).second + 4 }
        val out = ArrayList<Record>()
        repeat(n) {
            if (i >= b.size) return out
            val (name, j) = readName(b, i)
            val type = u16(b, j); val len = u16(b, j + 8); val d = j + 10
            if (d + len > b.size) return out
            val data: Any = when (type) {
                12 -> readName(b, d).first
                33 -> Triple(u16(b, d + 4), readName(b, d + 6).first, 0)
                1 -> if (len == 4) InetAddress.getByAddress(b.copyOfRange(d, d + 4)).hostAddress ?: "" else ""
                16 -> {
                    val m = HashMap<String, String>(); var k = d
                    while (k < d + len) { val l = b[k].toInt() and 0xFF; val s = String(b, k + 1, l, Charsets.UTF_8); k += 1 + l; val e = s.indexOf('='); if (e > 0) m[s.substring(0, e)] = s.substring(e + 1) }
                    m
                }
                else -> ""
            }
            out.add(Record(name, type, data))
            i = d + len
        }
        return out
    }

    /** TVs from a set of records: one per SRV, with its address and TXT (fn = name, id). */
    fun devices(records: List<Record>, from: Map<String, String> = emptyMap()): List<TvDevice> {
        val a = records.filter { it.type == 1 }.associate { it.name.lowercase() to it.data as String }
        val txt = records.filter { it.type == 16 }.associate { it.name.lowercase() to @Suppress("UNCHECKED_CAST") (it.data as Map<String, String>) }
        return records.filter { it.type == 33 && it.name.contains("_googlecast", true) }.mapNotNull { r ->
            @Suppress("UNCHECKED_CAST") val srv = r.data as Triple<Int, String, Int>
            val port = srv.first; val target = srv.second
            val ip = a[target.lowercase()] ?: from[r.name.lowercase()] ?: return@mapNotNull null
            val t = txt[r.name.lowercase()].orEmpty()
            TvDevice("cast", "cast:" + (t["id"]?.ifBlank { null } ?: ip), t["fn"]?.ifBlank { null } ?: r.name.substringBefore("._googlecast"), ip, port)
        }
    }

    fun search(timeoutMs: Long, log: (String) -> Unit, onDevice: (TvDevice) -> Unit) {
        val sock = MulticastSocket(0)
        try {
            wifiInterface()?.let { runCatching { sock.networkInterface = it } }
            sock.timeToLive = 255
            sock.soTimeout = 300
            val q = query("_googlecast._tcp.local")
            val group = InetAddress.getByName("224.0.0.251")
            val end = System.currentTimeMillis() + timeoutMs
            var sent = 0L
            val records = ArrayList<Record>()
            val senders = HashMap<String, String>()
            var answers = 0
            val buf = ByteArray(9000)
            while (System.currentTimeMillis() < end) {
                if (System.currentTimeMillis() - sent > 1500) { runCatching { sock.send(DatagramPacket(q, q.size, group, 5353)) }.onFailure { log("mDNS send: $it") }; sent = System.currentTimeMillis() }
                val p = DatagramPacket(buf, buf.size)
                try { sock.receive(p) } catch (_: SocketTimeoutException) { continue }
                answers++
                val rs = parse(p.data.copyOf(p.length))
                rs.filter { it.type == 33 }.forEach { senders[it.name.lowercase()] = p.address.hostAddress ?: "" }
                records.addAll(rs)
                devices(records, senders).forEach(onDevice)
            }
            log("mDNS: $answers answers")
        } finally { sock.close() }
    }
}
