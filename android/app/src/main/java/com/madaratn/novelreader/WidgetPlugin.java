package com.madaratn.novelreader;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The page's side of the "Continue" widget (ContinueWidget.java):
 *  update({title, sub, kind, id, cover}) shows what is in progress;
 *  take() gives the title the widget was tapped for when the app started;
 *  "open" event: the widget was tapped while the app was already running.
 */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    private String pending = "";

    @Override
    public void load() {
        Intent i = getActivity().getIntent();
        if (i != null && i.hasExtra(ContinueWidget.EXTRA)) { pending = i.getStringExtra(ContinueWidget.EXTRA); i.removeExtra(ContinueWidget.EXTRA); }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !intent.hasExtra(ContinueWidget.EXTRA)) return;
        String v = intent.getStringExtra(ContinueWidget.EXTRA);
        intent.removeExtra(ContinueWidget.EXTRA);
        notifyListeners("open", target(v));
    }

    private JSObject target(String v) {
        JSObject r = new JSObject();
        String s = v == null ? "" : v;
        int bar = s.indexOf('|');
        r.put("kind", bar > 0 ? s.substring(0, bar) : "");
        r.put("id", bar > 0 ? s.substring(bar + 1) : "");
        return r;
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject r = pending.isEmpty() ? new JSObject() : target(pending);
        pending = "";
        call.resolve(r);
    }

    @PluginMethod
    public void update(PluginCall call) {
        final String title = call.getString("title", ""), sub = call.getString("sub", ""), kind = call.getString("kind", ""), id = call.getString("id", "");
        final String cover = call.getString("cover", "");
        final android.content.Context c = getContext().getApplicationContext();
        String before = ContinueWidget.prefs(c).getString("cover", "");
        ContinueWidget.prefs(c).edit().putString("title", title).putString("sub", sub).putString("kind", kind).putString("id", id).putString("cover", cover).apply();
        ContinueWidget.refreshAll(c);
        call.resolve();
        if (cover == null || cover.equals(before) && ContinueWidget.coverFile(c).exists()) return;
        new Thread(() -> {
            File f = ContinueWidget.coverFile(c);
            try {
                if (!(cover.startsWith("https://") || cover.startsWith("http://"))) { f.delete(); }
                else {
                    HttpURLConnection h = (HttpURLConnection) new URL(cover).openConnection();
                    h.setConnectTimeout(6000); h.setReadTimeout(8000);
                    try (InputStream in = h.getInputStream()) {
                        Bitmap b = BitmapFactory.decodeStream(in);
                        if (b == null) { f.delete(); }
                        else {
                            int w = 180, hh = Math.max(1, b.getHeight() * w / Math.max(1, b.getWidth()));
                            Bitmap s = Bitmap.createScaledBitmap(b, w, hh, true);
                            try (FileOutputStream out = new FileOutputStream(f)) { s.compress(Bitmap.CompressFormat.PNG, 90, out); }
                        }
                    }
                }
            } catch (Exception e) { f.delete(); }
            ContinueWidget.refreshAll(c);
        }).start();
    }
}
