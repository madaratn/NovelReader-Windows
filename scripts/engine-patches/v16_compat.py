"""Engine patches for newer (lib 16) Aniyomi extensions, found by the source scan.

1. Bytecode repair runs twice: some dex2jar output only becomes analysable after
   the first pass (MovieBox, Flixer, Cinemaos, Lunar... failed with
   "VerifyError: Call to wrong <init> method"). Marker bumped so installed jars
   are repaired again.
2. NetworkHelper.cloudflareClient / nonCloudflareClient (2Dhive and others).
3. android.net.Uri.encode(String) with Android semantics (AnimeSaga).
4. TLS like a browser: JDK roots + Windows roots, and missing intermediate
   certificates fetched from the certificate itself (AIA) - EmpireStreaming,
   AnimeVostFr, UHD Movies failed with "PKIX path building failed".
5. Seeking in proxied videos: the length of the video is sent (Ktor refused the
   copied Content-Length header, so the player saw a stream of unknown size and
   could not jump ahead), and when a video server ignores the requested byte
   range, the proxy skips to the requested place itself and answers 206.
Usage: python v16_compat.py <miwayomi source root>
"""
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else "miwayomi")


def edit(rel, old, new, what, count=1):
    p = root / rel
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"{what}: anchor not found in {rel}")
    p.write_text(s.replace(old, new, count))


# 1. Two repair passes; drop the previous marker entries when rewriting.
edit("server/src/main/kotlin/miwayomi/extension/ExtensionManager.kt",
     "            JarFixer.fixStackmapFrames(jar)\n",
     "            JarFixer.fixStackmapFrames(jar)\n"
     "            // Second pass: some dex2jar output is only analysable once repaired.\n"
     "            JarFixer.fixStackmapFrames(jar)\n",
     "double repair pass")
edit("server/src/main/kotlin/miwayomi/extension/JarFixer.kt",
     "                    if (entry.isDirectory) continue\n",
     "                    if (entry.isDirectory) continue\n"
     "                    if (entry.name.startsWith(\"META-INF/miwayomi-jarfixed\")) continue\n",
     "skip old markers")
edit("server/src/main/kotlin/miwayomi/extension/JarFixer.kt",
     "META-INF/miwayomi-jarfixed-v5", "META-INF/miwayomi-jarfixed-v6", "marker v6")

# 2. Clients newer extensions ask for.
edit("core-common/src/main/kotlin/eu/kanade/tachiyomi/network/NetworkHelper.kt",
     "    fun defaultUserAgentProvider(): String",
     "    // Newer extensions (lib 16) ask for these; the client already handles Cloudflare.\n"
     "    val cloudflareClient: OkHttpClient get() = client\n"
     "    val nonCloudflareClient: OkHttpClient get() = client\n\n"
     "    fun defaultUserAgentProvider(): String",
     "cloudflareClient")

# 4. Browser-like TLS validation on every request.
edit("core-common/src/main/kotlin/eu/kanade/tachiyomi/network/NetworkHelper.kt",
     "            .addNetworkInterceptor(FixDoubleEncodedJsonInterceptor())\n",
     "            .addNetworkInterceptor(FixDoubleEncodedJsonInterceptor())\n"
     "            .apply { NovelReaderTls.install(this) }\n",
     "TLS install")
(root / "core-common/src/main/kotlin/eu/kanade/tachiyomi/network/NovelReaderTls.kt").write_text('''package eu.kanade.tachiyomi.network

import okhttp3.OkHttpClient
import java.net.URI
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Validates server certificates like a browser does: the Java roots plus the
 * Windows roots, and when a site sends an incomplete chain, the missing
 * intermediate certificates are downloaded from the address written in the
 * certificate itself (AIA "CA Issuers"). A chain is still only accepted when a
 * trusted root signs it.
 */
object NovelReaderTls {
    private fun managerFor(ks: KeyStore?): X509TrustManager? = try {
        val f = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        f.init(ks)
        f.trustManagers.filterIsInstance<X509TrustManager>().firstOrNull()
    } catch (_: Throwable) {
        null
    }

    private val managers: List<X509TrustManager> by lazy {
        val list = mutableListOf<X509TrustManager>()
        managerFor(null)?.let { list.add(it) }
        if (System.getProperty("os.name").orEmpty().lowercase().contains("win")) {
            try {
                val ks = KeyStore.getInstance("Windows-ROOT")
                ks.load(null, null)
                managerFor(ks)?.let { list.add(it) }
            } catch (_: Throwable) {
            }
        }
        list
    }

    private val downloaded = ConcurrentHashMap<String, X509Certificate>()

    // Short-form DER scan for the CA Issuers URI (OID 1.3.6.1.5.5.7.48.2, tag [6]).
    private fun caIssuerUrl(c: X509Certificate): String? {
        val ext = c.getExtensionValue("1.3.6.1.5.5.7.1.1") ?: return null
        val oid = byteArrayOf(0x06, 0x08, 0x2B, 0x06, 0x01, 0x05, 0x05, 0x07, 0x30, 0x02)
        outer@ for (i in 0..ext.size - oid.size) {
            for (k in oid.indices) if (ext[i + k] != oid[k]) continue@outer
            var p = i + oid.size
            if (p + 2 > ext.size || (ext[p].toInt() and 0xFF) != 0x86) return null
            val len = ext[p + 1].toInt() and 0xFF
            p += 2
            if (len >= 0x80 || p + len > ext.size) return null
            val url = String(ext, p, len, Charsets.US_ASCII)
            return url.takeIf { it.startsWith("http") }
        }
        return null
    }

    private fun download(url: String): X509Certificate? = downloaded[url] ?: try {
        val conn = URI(url).toURL().openConnection()
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        val bytes = conn.getInputStream().use { it.readBytes() }
        val cf = CertificateFactory.getInstance("X.509")
        val cert = try {
            cf.generateCertificate(bytes.inputStream()) as X509Certificate
        } catch (_: Throwable) {
            cf.generateCertificates(bytes.inputStream()).first() as X509Certificate
        }
        downloaded[url] = cert
        cert
    } catch (_: Throwable) {
        null
    }

    private fun check(chain: Array<X509Certificate>, authType: String) {
        var last: CertificateException? = null
        for (m in managers) {
            try {
                m.checkServerTrusted(chain, authType)
                return
            } catch (e: CertificateException) {
                last = e
            }
        }
        throw last ?: CertificateException("No trust manager")
    }

    val trustManager: X509TrustManager = object : X509TrustManager {
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
            managers.first().checkClientTrusted(chain, authType)
        }

        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
            try {
                check(chain, authType)
                return
            } catch (e: CertificateException) {
                val full = chain.toMutableList()
                repeat(3) {
                    val url = caIssuerUrl(full.last()) ?: throw e
                    val issuer = download(url) ?: throw e
                    if (full.contains(issuer)) throw e
                    full.add(issuer)
                    try {
                        check(full.toTypedArray(), authType)
                        return
                    } catch (_: CertificateException) {
                    }
                }
                throw e
            }
        }

        override fun getAcceptedIssuers(): Array<X509Certificate> =
            managers.flatMap { it.acceptedIssuers.toList() }.toTypedArray()
    }

    fun install(builder: OkHttpClient.Builder) {
        try {
            val ctx = SSLContext.getInstance("TLS")
            ctx.init(null, arrayOf<TrustManager>(trustManager), null)
            builder.sslSocketFactory(ctx.socketFactory, trustManager)
        } catch (e: Throwable) {
            System.err.println("[novelreader] TLS setup failed: $e")
        }
    }
}
''')

# 3. Uri.encode(String) like Android: letters, digits and _-!.~'()* kept.
edit("android-compat/src/main/kotlin/android/net/Uri.kt",
     '''        fun encode(s: String, allow: String = "!#$&'()*+,/:;=?@[]~.-_"): String {
            val sb = StringBuilder()
            for (ch in s) {
                if (ch.isLetterOrDigit() || ch in allow) sb.append(ch) else {''',
     '''        fun encode(s: String): String = encode(s, null)

        @JvmStatic
        fun encode(s: String, allow: String?): String {
            val sb = StringBuilder()
            for (ch in s) {
                if ((ch in 'a'..'z') || (ch in 'A'..'Z') || (ch in '0'..'9') || ch in "_-!.~'()*" || (allow != null && ch in allow)) sb.append(ch) else {''',
     "Uri.encode")
# 5. Seeking: Content-Length through respondBytesWriter, byte ranges emulated.
api = root / "server/src/main/kotlin/miwayomi/api/ApiHelpers.kt"
src = api.read_text()
start = src.index("internal suspend fun ApplicationCall.proxyStream(")
end = src.index("\n}\n", start) + 3
src = src[:start] + '''internal suspend fun ApplicationCall.proxyStream(
    upstream: okhttp3.Response,
    contentType: String,
    status: HttpStatusCode,
    requestedRange: String? = null,
) {
    val body = upstream.body
    if (body == null) {
        upstream.close()
        respond(status, ErrorDto("empty body"))
        return
    }
    val upLength = upstream.header("Content-Length")?.toLongOrNull() ?: body.contentLength().takeIf { it >= 0 }
    var outStatus = status
    var outLength = upLength
    var skip = 0L
    val wanted = requestedRange?.let { Regex("""bytes=(\\d+)-(\\d*)""").find(it) }
    if (status == HttpStatusCode.OK && wanted != null && upLength != null && upLength > 0) {
        // The video server ignored the byte range: skip to it here.
        val from = wanted.groupValues[1].toLong()
        if (from in 0 until upLength) {
            skip = from
            outStatus = HttpStatusCode.PartialContent
            outLength = upLength - from
            response.headers.append(HttpHeaders.ContentRange, "bytes $from-${upLength - 1}/$upLength")
        }
    } else {
        upstream.header("Content-Range")?.let { response.headers.append(HttpHeaders.ContentRange, it) }
    }
    if (upLength != null || upstream.header("Accept-Ranges") != null) response.headers.append(HttpHeaders.AcceptRanges, "bytes")
    try {
        respondBytesWriter(ContentType.parse(contentType), outStatus, outLength) {
            val input = body.byteStream()
            try {
                val buf = ByteArray(64 * 1024)
                var left = skip
                while (left > 0) {
                    val n = input.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
                    if (n < 0) break
                    left -= n
                }
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    writeFully(buf, 0, n)
                }
            } finally {
                runCatching { input.close() }
            }
        }
    } finally {
        upstream.close()
    }
}
''' + src[end:]
api.write_text(src)
routes = root / "server/src/main/kotlin/miwayomi/api/StreamingRoutes.kt"
r = routes.read_text()
old = """            val status = if (response.code == 206) HttpStatusCode.PartialContent else HttpStatusCode.OK
            call.proxyStream(response, contentType, status)
        }"""
if old not in r:
    raise SystemExit("proxy route anchor not found")
r = r.replace(old, """            val status = if (response.code == 206) HttpStatusCode.PartialContent else HttpStatusCode.OK
            call.proxyStream(response, contentType, status, range)
        }""", 1)
routes.write_text(r)
print("v16 compatibility patches applied")
