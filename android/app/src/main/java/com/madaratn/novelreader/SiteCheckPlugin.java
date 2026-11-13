package com.madaratn.novelreader;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.regex.Pattern;

/**
 * Passes a site's anti-bot check (Cloudflare "Just a moment…", DDoS-Guard…) for the
 * book sources, the way the LNReader app does: the page is opened in a WebView
 * inside the app, its script sets the clearance cookie, and that cookie (with the
 * WebView's user agent, which it is tied to) is handed back for the next requests.
 * The WebView is invisible first; if the check wants a click, it is shown full
 * screen with a short explanation and a Cancel button.
 *
 * solve({url, show, title, hint, cancel}) -> {ok, cookie, userAgent}
 */
@CapacitorPlugin(name = "SiteCheck")
public class SiteCheckPlugin extends Plugin {
    private static final Pattern CHALLENGE = Pattern.compile(
        "just a moment|attention required|un instant|un momento|einen moment|ddos-guard|security check|checking your browser|please wait|making sure you|loading|redirecting|проверка",
        Pattern.CASE_INSENSITIVE);
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean busy = false;

    @PluginMethod
    public void solve(PluginCall call) {
        final String url = call.getString("url", "");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) { call.reject("bad address"); return; }
        if (busy) { JSObject r = new JSObject(); r.put("ok", false); r.put("busy", true); call.resolve(r); return; }
        busy = true;
        final boolean show = call.getBoolean("show", true);
        final String title = call.getString("title", "Site check");
        final String hint = call.getString("hint", "This site checks that you are not a robot. Tick the box if one appears.");
        final String cancelText = call.getString("cancel", "Cancel");
        main.post(() -> run(call, url, show, title, hint, cancelText));
    }

    private void run(PluginCall call, String url, boolean show, String title, String hint, String cancelText) {
        final ViewGroup root = getActivity().findViewById(android.R.id.content);
        final LinearLayout box = new LinearLayout(getContext());
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.parseColor("#0b0c10"));
        final LinearLayout head = new LinearLayout(getContext());
        head.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        head.setPadding(pad, pad + dp(24), pad, dp(8));
        TextView t = new TextView(getContext());
        t.setText(title); t.setTextColor(Color.WHITE); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        TextView h = new TextView(getContext());
        h.setText(hint); h.setTextColor(Color.parseColor("#b9bdcc")); h.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        Button cancel = new Button(getContext());
        cancel.setText(cancelText);
        head.addView(t); head.addView(h); head.addView(cancel);
        head.setVisibility(View.GONE);

        final WebView web = new WebView(getContext());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        // Only web pages: no other app, no file, no intent link.
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String scheme = r.getUrl().getScheme();
                return !("https".equals(scheme) || "http".equals(scheme));
            }
        });
        box.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        box.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        // Invisible at first: a tiny, see-through view still runs the page's scripts.
        final FrameLayout.LayoutParams tiny = new FrameLayout.LayoutParams(dp(2), dp(2), Gravity.TOP | Gravity.START);
        box.setAlpha(0.01f);
        root.addView(box, tiny);

        final long started = System.currentTimeMillis();
        final boolean[] done = {false};
        final boolean[] shown = {false};
        final Runnable[] tick = new Runnable[1];
        final java.util.function.Consumer<Boolean> finish = ok -> {
            if (done[0]) return;
            done[0] = true;
            main.removeCallbacks(tick[0]);
            JSObject r = new JSObject();
            r.put("ok", ok);
            r.put("userAgent", web.getSettings().getUserAgentString());
            String cookie = CookieManager.getInstance().getCookie(url);
            r.put("cookie", cookie == null ? "" : cookie);
            CookieManager.getInstance().flush();
            try { root.removeView(box); web.stopLoading(); web.destroy(); } catch (Exception ignored) {}
            busy = false;
            call.resolve(r);
        };
        cancel.setOnClickListener(v -> finish.accept(false));
        tick[0] = () -> {
            if (done[0]) return;
            long waited = System.currentTimeMillis() - started;
            String title2 = web.getTitle();
            boolean loading = web.getProgress() < 100;
            if (!loading && title2 != null && !title2.isEmpty() && !title2.startsWith("http") && !CHALLENGE.matcher(title2).find()) { finish.accept(true); return; }
            if (!shown[0] && show && waited > 12000) {
                // Still on the check page: it probably wants a click.
                shown[0] = true;
                head.setVisibility(View.VISIBLE);
                box.setAlpha(1f);
                box.setLayoutParams(new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                box.bringToFront();
            }
            if (waited > (show ? 120000 : 25000)) { finish.accept(false); return; }
            main.postDelayed(tick[0], 700);
        };
        web.loadUrl(url);
        main.postDelayed(tick[0], 1200);
    }

    private int dp(int v) { return (int) (v * getContext().getResources().getDisplayMetrics().density); }
}
