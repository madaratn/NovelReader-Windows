package com.madaratn.novelreader;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Sync with the PC: the same file as on Windows (NovelReader/library-sync.json in a
 * Google Drive / OneDrive folder), opened through Android's file picker. Android
 * keeps the permission, and the cloud app uploads / downloads the file.
 */
@CapacitorPlugin(name = "Sync")
public class SyncPlugin extends Plugin {
    static final long MAX_BYTES = 50L * 1024 * 1024;

    private SharedPreferences prefs() { return getContext().getSharedPreferences("sync", Context.MODE_PRIVATE); }
    private Uri uri() { String u = prefs().getString("uri", null); return u == null ? null : Uri.parse(u); }

    private String displayName(Uri u) {
        try (Cursor c = getContext().getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return "";
    }

    private JSObject status() {
        Uri u = uri();
        JSObject r = new JSObject();
        r.put("enabled", u != null);
        r.put("file", u == null ? null : displayName(u));
        r.put("provider", u == null ? null : u.getAuthority());
        r.put("deviceName", Build.MANUFACTURER + " " + Build.MODEL);
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) { call.resolve(status()); }

    @PluginMethod
    public void choose(PluginCall call) {
        boolean create = Boolean.TRUE.equals(call.getBoolean("create", false));
        Intent i = new Intent(create ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(create ? "application/json" : "*/*");
        if (create) i.putExtra(Intent.EXTRA_TITLE, "library-sync.json");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) { call.resolve(status()); return; }
        Uri u = data.getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception e) { call.reject("This place does not let NovelReader keep access to the file. Choose a file in Google Drive, OneDrive or on the phone."); return; }
        Uri old = uri();
        if (old != null && !old.equals(u)) { try { getContext().getContentResolver().releasePersistableUriPermission(old, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception ignored) {} }
        prefs().edit().putString("uri", u.toString()).apply();
        call.resolve(status());
    }

    @PluginMethod
    public void read(PluginCall call) {
        Uri u = uri();
        if (u == null) { call.reject("Sync is not set up."); return; }
        new Thread(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(u)) {
                if (in == null) throw new java.io.IOException("no stream");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); if (out.size() > MAX_BYTES) { call.reject("The sync file is too large."); return; } }
                JSObject r = new JSObject();
                r.put("text", new String(out.toByteArray(), StandardCharsets.UTF_8));
                call.resolve(r);
            } catch (Exception e) { call.reject("The sync file could not be read: " + e.getMessage()); }
        }).start();
    }

    @PluginMethod
    public void write(PluginCall call) {
        Uri u = uri();
        String text = call.getString("text");
        if (u == null) { call.reject("Sync is not set up."); return; }
        if (text == null) { call.reject("Invalid sync data."); return; }
        new Thread(() -> {
            // "wt": replace the content (a shorter file must not keep the old tail).
            try (OutputStream out = getContext().getContentResolver().openOutputStream(u, "wt")) {
                if (out == null) throw new java.io.IOException("no stream");
                out.write(text.getBytes(StandardCharsets.UTF_8));
                out.flush();
                call.resolve(new JSObject());
            } catch (Exception e) { call.reject("The sync file could not be written: " + e.getMessage()); }
        }).start();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        Uri u = uri();
        if (u != null) { try { getContext().getContentResolver().releasePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception ignored) {} }
        prefs().edit().remove("uri").apply();
        call.resolve(status());
    }
}
