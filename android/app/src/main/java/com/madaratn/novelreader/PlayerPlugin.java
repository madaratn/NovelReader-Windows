package com.madaratn.novelreader;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
}
