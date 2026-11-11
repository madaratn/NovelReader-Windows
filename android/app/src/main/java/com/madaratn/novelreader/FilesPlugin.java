package com.madaratn.novelreader;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
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

/** Saves a text file where the person chooses (backup export) and reads one they pick (restore). */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {
    static final long MAX_BYTES = 80L * 1024 * 1024;

    private String nameOf(Uri u) {
        try (Cursor c = getContext().getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return "";
    }

    @PluginMethod
    public void save(PluginCall call) {
        if (call.getString("text") == null) { call.reject("Nothing to save."); return; }
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(call.getString("type", "application/json"));
        i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "NovelReader.json"));
        startActivityForResult(call, i, "saved");
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        JSObject r = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) { r.put("ok", false); r.put("canceled", true); call.resolve(r); return; }
        Uri u = data.getData();
        String text = call.getString("text", "");
        new Thread(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(u, "wt")) {
                if (out == null) throw new java.io.IOException("no stream");
                out.write(text.getBytes(StandardCharsets.UTF_8));
                out.flush();
                r.put("ok", true); r.put("path", nameOf(u));
                call.resolve(r);
            } catch (Exception e) { call.reject("The file could not be saved: " + e.getMessage()); }
        }).start();
    }

    @PluginMethod
    public void open(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(call, i, "opened");
    }

    @ActivityCallback
    private void opened(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        JSObject r = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) { r.put("ok", false); r.put("canceled", true); call.resolve(r); return; }
        Uri u = data.getData();
        new Thread(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(u)) {
                if (in == null) throw new java.io.IOException("no stream");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); if (out.size() > MAX_BYTES) { call.reject("This file is too large."); return; } }
                r.put("ok", true); r.put("name", nameOf(u)); r.put("text", new String(out.toByteArray(), StandardCharsets.UTF_8));
                call.resolve(r);
            } catch (Exception e) { call.reject("The file could not be read: " + e.getMessage()); }
        }).start();
    }
}
