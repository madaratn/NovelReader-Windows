package com.madaratn.novelreader;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Links that open the app (novelreader://party/CODE: an invitation to a watch party).
 *  take() gives the link the app was started with (once);
 *  "open" event: a link was opened while the app was already running.
 */
@CapacitorPlugin(name = "Link")
public class LinkPlugin extends Plugin {
    private String pending = "";

    /** The novelreader:// link carried by [i], or "" (anything else is not ours). */
    static String linkOf(Intent i) {
        if (i == null || !Intent.ACTION_VIEW.equals(i.getAction())) return "";
        Uri u = i.getData();
        return u != null && "novelreader".equals(u.getScheme()) ? u.toString() : "";
    }

    @Override
    public void load() {
        Intent i = getActivity().getIntent();
        pending = linkOf(i);
        // Read once: turning the screen or coming back to the app must not join again.
        if (!pending.isEmpty()) i.setData(null);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String url = linkOf(intent);
        if (url.isEmpty()) return;
        intent.setData(null);
        JSObject r = new JSObject();
        r.put("url", url);
        notifyListeners("open", r, true);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject r = new JSObject();
        r.put("url", pending);
        pending = "";
        call.resolve(r);
    }
}
