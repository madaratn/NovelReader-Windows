package com.madaratn.novelreader;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * New chapters while the app is closed. The book sources are JavaScript: a hidden
 * page of the app (index.html#bg-chapters, src/platform/bg-chapters.ts) runs them and
 * reports the novels with new chapters. This class is that page's host: it serves the
 * app's files, does its web requests (no browser cross-site limits), and waits.
 */
public class ChapterCheck {
    static final int MAX_BODY = 12 * 1024 * 1024;

    static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    /** One web request for the page: {url, method, headers, body} -> {status, headers, body (base64), url} or {error}. */
    static JSONObject http(JSONObject req) {
        JSONObject out = new JSONObject();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(req.getString("url")).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(25000);
            c.setInstanceFollowRedirects(true);
            String method = req.optString("method", "GET");
            c.setRequestMethod(method);
            JSONObject h = req.optJSONObject("headers");
            if (h != null) for (Iterator<String> it = h.keys(); it.hasNext(); ) { String k = it.next(); if (!k.equalsIgnoreCase("accept-encoding") && !k.equalsIgnoreCase("content-length") && !k.equalsIgnoreCase("host")) c.setRequestProperty(k, h.getString(k)); }
            if (!req.isNull("body") && !method.equals("GET") && !method.equals("HEAD")) {
                c.setDoOutput(true);
                try (OutputStream o = c.getOutputStream()) { o.write(req.getString("body").getBytes(StandardCharsets.UTF_8)); }
            }
            int status = c.getResponseCode();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in != null) try (InputStream i = in) {
                byte[] b = new byte[32 * 1024];
                int n;
                while ((n = i.read(b)) > 0) { buf.write(b, 0, n); if (buf.size() > MAX_BODY) throw new java.io.IOException("answer too large"); }
            }
            JSONObject headers = new JSONObject();
            for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                // The body is already decoded here: its original encoding and length no longer apply.
                if (e.getKey() == null || e.getKey().equalsIgnoreCase("content-encoding") || e.getKey().equalsIgnoreCase("content-length") || e.getKey().equalsIgnoreCase("transfer-encoding")) continue;
                headers.put(e.getKey().toLowerCase(), android.text.TextUtils.join(", ", e.getValue()));
            }
            out.put("status", status).put("headers", headers).put("url", c.getURL().toString()).put("body", Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP));
        } catch (Exception e) {
            try { out.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {}
        } finally { if (c != null) c.disconnect(); }
        return out;
    }

    /** Runs the hidden page and returns what it reported ({names:[…], checked}), or null (time out, no WebView). */
    @SuppressLint("SetJavaScriptEnabled")
    static JSONObject run(Context context, long timeoutMs) {
        final Context app = context.getApplicationContext();
        final Handler main = new Handler(Looper.getMainLooper());
        final CountDownLatch done = new CountDownLatch(1);
        final JSONObject[] result = new JSONObject[1];
        final WebView[] holder = new WebView[1];
        final ExecutorService pool = Executors.newFixedThreadPool(4);
        main.post(() -> {
            try {
                WebView w = new WebView(app);
                holder[0] = w;
                w.getSettings().setJavaScriptEnabled(true);
                w.getSettings().setDomStorageEnabled(true);
                w.addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void http(int id, String json) {
                        pool.execute(() -> {
                            JSONObject res;
                            try { res = ChapterCheck.http(new JSONObject(json)); } catch (Exception e) { res = new JSONObject(); try { res.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {} }
                            final String js = "window.__nrHttp&&window.__nrHttp(" + id + "," + res + ")";
                            main.post(() -> { if (holder[0] != null) holder[0].evaluateJavascript(js, null); });
                        });
                    }

                    @JavascriptInterface
                    public void done(String json) {
                        try { result[0] = new JSONObject(json); } catch (Exception e) { result[0] = new JSONObject(); }
                        done.countDown();
                    }
                }, "NRBackground");
                w.setWebViewClient(new WebViewClient() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                        // Only the app's own files are served to this page (same address as the app: same saved data).
                        if (!"localhost".equals(request.getUrl().getHost())) return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", null, new java.io.ByteArrayInputStream(new byte[0]));
                        String path = request.getUrl().getPath();
                        if (path == null || path.equals("/")) path = "/index.html";
                        try { return new WebResourceResponse(mime(path), "utf-8", app.getAssets().open("public" + path)); }
                        catch (Exception e) { return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, new java.io.ByteArrayInputStream(new byte[0])); }
                    }
                });
                w.loadUrl("https://localhost/index.html#bg-chapters");
            } catch (Exception e) {
                android.util.Log.w("NovelReader", "chapter check: " + e);
                done.countDown();
            }
        });
        try { done.await(timeoutMs, TimeUnit.MILLISECONDS); } catch (InterruptedException ignored) {}
        main.post(() -> { try { if (holder[0] != null) { holder[0].destroy(); holder[0] = null; } } catch (Exception ignored) {} });
        pool.shutdownNow();
        return result[0];
    }
}
