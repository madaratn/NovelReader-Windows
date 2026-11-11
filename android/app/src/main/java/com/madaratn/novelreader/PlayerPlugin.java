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
