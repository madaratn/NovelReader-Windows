package nr.engine.cf

import android.annotation.SuppressLint
import android.app.Application
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Gets through Cloudflare's browser check like Aniyomi does on Android: the page is
 * opened in a hidden WebView (a real browser), which runs the check; once the page
 * is the real one, its cookies (cf_clearance), browser identity and HTML are handed
 * to the engine. One page at a time.
 */
class WebViewSolver(private val app: Application) {
    data class Result(val url: String, val html: String, val cookies: List<Triple<String, String, String>>, val userAgent: String, val contentType: String = "text/html; charset=utf-8")

    private val main = Handler(Looper.getMainLooper())
    private var webView: WebView? = null
    @Volatile var userAgent: String = ""
        private set

    @SuppressLint("SetJavaScriptEnabled")
    private fun view(): WebView = webView ?: WebView(app).also { wv ->
        wv.settings.javaScriptEnabled = true
        wv.settings.domStorageEnabled = true
        wv.settings.databaseEnabled = true
        wv.settings.cacheMode = WebSettings.LOAD_DEFAULT
        // As a normal phone browser: without the "; wv" WebView mark.
        wv.settings.userAgentString = wv.settings.userAgentString.replace("; wv)", ")")
        userAgent = wv.settings.userAgentString
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
        wv.webViewClient = WebViewClient()
        webView = wv
    }

    private fun <T> onMain(timeoutMs: Long = 10000, f: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return f()
        val latch = CountDownLatch(1)
        var r: Result<T>? = null
        main.post { r = runCatching(f); latch.countDown() }
        if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) throw IllegalStateException("WebView busy")
        return r!!.getOrThrow()
    }

    private fun js(script: String): String {
        val latch = CountDownLatch(1)
        var out = "null"
        main.post { view().evaluateJavascript(script) { v -> out = v ?: "null"; latch.countDown() } }
        latch.await(10, TimeUnit.SECONDS)
        // evaluateJavascript gives a JSON value: a string comes back quoted.
        return runCatching { Json.parseToJsonElement(out).jsonPrimitive.content }.getOrDefault(out)
    }

    fun isChallenge(title: String, head: String): Boolean {
        val t = (title + " " + head).lowercase()
        return t.contains("just a moment") || t.contains("checking your browser") || t.contains("attention required") ||
            t.contains("cf-chl") || t.contains("challenge-platform") || t.contains("un instant") || t.contains("veuillez patienter")
    }

    @Synchronized
    fun solve(url: String, method: String, postData: String?, headers: Map<String, String>, maxMs: Long): Result {
        onMain {
            val wv = view()
            val extra = headers.filterKeys { !it.equals("User-Agent", true) && !it.equals("Cookie", true) }
            if (method.equals("POST", true)) wv.postUrl(url, (postData ?: "").toByteArray()) else wv.loadUrl(url, extra)
        }
        val end = System.currentTimeMillis() + maxMs
        Thread.sleep(1200)
        var passes = 0
        while (System.currentTimeMillis() < end) {
            val state = js("(function(){try{return JSON.stringify({r:document.readyState,t:document.title||'',h:(document.documentElement?document.documentElement.innerHTML:'').slice(0,4000),u:location.href})}catch(e){return '{}'}})()")
            val o = runCatching { Json.parseToJsonElement(state).let { it as kotlinx.serialization.json.JsonObject } }.getOrNull()
            val ready = o?.get("r")?.jsonPrimitive?.content == "complete"
            val title = o?.get("t")?.jsonPrimitive?.content ?: ""
            val head = o?.get("h")?.jsonPrimitive?.content ?: ""
            val cookie = CookieManager.getInstance().getCookie(url) ?: ""
            // The real page: loaded, not a check page (twice in a row, the check reloads the page).
            if (ready && head.isNotBlank() && !isChallenge(title, head)) { if (++passes >= 2 || cookie.contains("cf_clearance")) break } else passes = 0
            Thread.sleep(700)
        }
        // JSON or text answers (APIs) are shown by the WebView as text: give the text back.
        val type = js("document.contentType||'text/html'")
        val html = if (type.contains("html", true)) js("(function(){return document.documentElement?document.documentElement.outerHTML:''})()")
            else js("(function(){return document.body?document.body.innerText:''})()")
        val finalUrl = js("location.href").ifBlank { url }
        if (type.contains("html", true) && isChallenge("", html.take(6000))) throw IllegalStateException("Cloudflare check not passed in ${maxMs / 1000} s (it may need a tap: open the site in Sources)")
        CookieManager.getInstance().flush()
        val host = runCatching { URI(url).host }.getOrNull() ?: ""
        val cookies = (CookieManager.getInstance().getCookie(url) ?: "").split(';').mapNotNull { kv ->
            val i = kv.indexOf('='); if (i <= 0) null else Triple(kv.substring(0, i).trim(), kv.substring(i + 1).trim(), host)
        }
        return Result(finalUrl, html, cookies, userAgent.ifBlank { onMain { view().settings.userAgentString } }, if (type.contains("html", true)) "text/html; charset=utf-8" else "$type; charset=utf-8")
    }
}
