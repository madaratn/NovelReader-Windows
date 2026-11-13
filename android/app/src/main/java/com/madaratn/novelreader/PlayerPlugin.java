package com.madaratn.novelreader;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSArray;

/** Video player helpers: the small floating window (a video in full screen only). */
@CapacitorPlugin(name = "Player")
public class PlayerPlugin extends Plugin {
    @PluginMethod
    public void enterPip(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            MainActivity a = MainActivity.current;
            JSObject r = new JSObject();
            r.put("ok", a != null && a.enterPip());
            call.resolve(r);
        });
    }

    /**
     * Opens the video in another player app (VLC, MX Player…), chosen by the user.
     * Used when the phone's built-in player shows the picture without the sound
     * (Dolby / DTS sound, which Android's WebView cannot decode).
     * {url, title, position (ms), headers: ["Name", "value", …]} -> {ok}
     */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) { call.reject("bad address"); return; }
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(Uri.parse(url), "video/*");
        String title = call.getString("title", "");
        if (title != null && !title.isEmpty()) { view.putExtra("title", title); view.putExtra("android.intent.extra.TITLE", title); }
        Long position = call.getLong("position", 0L);
        if (position != null && position > 0) { view.putExtra("position", position.intValue()); view.putExtra("from_start", false); }
        try {
            JSArray h = call.getArray("headers", new JSArray());
            if (h.length() > 1) { String[] arr = new String[h.length()]; for (int i = 0; i < h.length(); i++) arr[i] = h.getString(i); view.putExtra("headers", arr); }
        } catch (Exception ignored) {}
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        JSObject r = new JSObject();
        try {
            Intent chooser = Intent.createChooser(view, call.getString("chooserTitle", "Play with"));
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(chooser);
            r.put("ok", true);
        } catch (Exception e) { r.put("ok", false); r.put("error", String.valueOf(e.getMessage())); }
        call.resolve(r);
    }

    /** What kind of device this is ({tv}). */
    @PluginMethod
    public void device(PluginCall call) {
        MainActivity a = MainActivity.current;
        JSObject r = new JSObject();
        r.put("tv", a != null && a.isTv());
        call.resolve(r);
    }

    /** Back with nothing left to go back to: the app goes to the background (as the Home button does). */
    @PluginMethod
    public void leave(PluginCall call) {
        getActivity().runOnUiThread(() -> { getActivity().moveTaskToBack(true); call.resolve(); });
    }
}
