package com.madaratn.novelreader;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Which network the phone is on, for "download on Wi-Fi only":
 * status() -> {connected, unmetered, wifi}; "change" event with the same fields.
 * "unmetered" is what Android itself uses for "not mobile data" (Wi-Fi, Ethernet,
 * and not a Wi-Fi hotspot marked as metered).
 */
@CapacitorPlugin(name = "Net")
public class NetPlugin extends Plugin {
    private ConnectivityManager.NetworkCallback callback;

    private JSObject state() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        JSObject r = new JSObject();
        boolean connected = false, unmetered = false, wifi = false;
        try {
            Network n = cm.getActiveNetwork();
            NetworkCapabilities c = n == null ? null : cm.getNetworkCapabilities(n);
            if (c != null) {
                connected = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                unmetered = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
                wifi = c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET);
            }
        } catch (Exception ignored) {}
        r.put("connected", connected);
        r.put("unmetered", unmetered);
        r.put("wifi", wifi);
        return r;
    }

    @Override
    public void load() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            callback = new ConnectivityManager.NetworkCallback() {
                @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) { notifyListeners("change", state()); }
                @Override public void onLost(Network network) { notifyListeners("change", state()); }
            };
            cm.registerDefaultNetworkCallback(callback);
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void status(PluginCall call) { call.resolve(state()); }

    @Override
    protected void handleOnDestroy() {
        try { ((ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(callback); } catch (Exception ignored) {}
    }
}
