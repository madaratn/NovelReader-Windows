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

    // ---- Videos stored on the device: folders the person chose ----------------------
    private static final java.util.regex.Pattern VIDEO = java.util.regex.Pattern.compile(".*\\.(mp4|mkv|webm|m4v|mov|avi|ts)$", java.util.regex.Pattern.CASE_INSENSITIVE);

    private android.content.SharedPreferences prefs() { return getContext().getSharedPreferences("videos", android.content.Context.MODE_PRIVATE); }

    private java.util.List<Uri> trees() {
        java.util.List<Uri> out = new java.util.ArrayList<>();
        for (String u : new java.util.TreeSet<>(prefs().getStringSet("folders", new java.util.HashSet<>()))) out.add(Uri.parse(u));
        return out;
    }

    /** "primary:Movies/Anime" -> "Movies/Anime" (what the person recognises). */
    static String label(String treeId) {
        int i = treeId.indexOf(':');
        String rest = i >= 0 ? treeId.substring(i + 1) : treeId;
        return rest.isEmpty() ? treeId : rest;
    }

    private JSObject folderList() {
        com.getcapacitor.JSArray a = new com.getcapacitor.JSArray();
        for (Uri t : trees()) a.put(label(android.provider.DocumentsContract.getTreeDocumentId(t)));
        JSObject r = new JSObject();
        r.put("folders", a);
        return r;
    }

    @PluginMethod
    public void folders(PluginCall call) { call.resolve(folderList()); }

    @PluginMethod
    public void addFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && data != null && data.getData() != null) {
            Uri u = data.getData();
            try { getContext().getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
            catch (Exception e) { call.reject("This folder cannot be kept. Choose a folder of the phone's storage."); return; }
            java.util.Set<String> set = new java.util.HashSet<>(prefs().getStringSet("folders", new java.util.HashSet<>()));
            set.add(u.toString());
            prefs().edit().putStringSet("folders", set).apply();
        }
        call.resolve(folderList());
    }

    @PluginMethod
    public void removeFolder(PluginCall call) {
        String name = call.getString("folder", "");
        java.util.Set<String> set = new java.util.HashSet<>(prefs().getStringSet("folders", new java.util.HashSet<>()));
        for (Uri t : trees()) if (label(android.provider.DocumentsContract.getTreeDocumentId(t)).equals(name)) {
            set.remove(t.toString());
            try { getContext().getContentResolver().releasePersistableUriPermission(t, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) {}
        }
        prefs().edit().putStringSet("folders", set).apply();
        call.resolve(folderList());
    }

    private void walk(Uri tree, String docId, String rel, String folder, int depth, com.getcapacitor.JSArray out) {
        if (depth > 5 || out.length() >= 3000) return;
        Uri children = android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        try (Cursor c = getContext().getContentResolver().query(children, new String[] {
            android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID, android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            android.provider.DocumentsContract.Document.COLUMN_MIME_TYPE, android.provider.DocumentsContract.Document.COLUMN_SIZE,
            android.provider.DocumentsContract.Document.COLUMN_LAST_MODIFIED }, null, null, null)) {
            if (c == null) return;
            while (c.moveToNext()) {
                String id = c.getString(0), name = c.getString(1), mime = c.getString(2);
                if (name == null || name.startsWith(".")) continue;
                String path = rel.isEmpty() ? name : rel + "/" + name;
                if (android.provider.DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) { walk(tree, id, path, folder, depth + 1, out); continue; }
                if (!VIDEO.matcher(name).matches() && (mime == null || !mime.startsWith("video/"))) continue;
                JSObject v = new JSObject();
                v.put("name", name); v.put("folder", folder); v.put("relPath", path);
                v.put("size", c.getLong(3)); v.put("mtime", c.getLong(4));
                v.put("uri", android.provider.DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                out.put(v);
            }
        } catch (Exception e) { android.util.Log.w("NovelReader", "videos: " + e); }
    }

    @PluginMethod
    public void listVideos(PluginCall call) {
        new Thread(() -> {
            com.getcapacitor.JSArray out = new com.getcapacitor.JSArray();
            for (Uri t : trees()) { String id = android.provider.DocumentsContract.getTreeDocumentId(t); walk(t, id, "", label(id), 0, out); }
            JSObject r = new JSObject();
            r.put("videos", out);
            call.resolve(r);
        }).start();
    }
}
