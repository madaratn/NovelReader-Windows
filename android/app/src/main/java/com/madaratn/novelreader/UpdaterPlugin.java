package com.madaratn.novelreader;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * App updates on Android: the interface finds a newer APK on GitHub, this downloads
 * it in the background, then opens Android's installer (Android always asks the
 * person to confirm; the library stays, the key is the same).
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        dir.mkdirs();
        return new File(dir, "NovelReader-update.apk");
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        long expected = call.getLong("size", -1L);
        if (url == null || !url.startsWith("https://")) { call.reject("Invalid URL"); return; }
        new Thread(() -> {
            File out = apkFile();
            File part = new File(out.getPath() + ".part");
            try {
                HttpURLConnection c = null;
                String u = url;
                for (int i = 0; i < 6; i++) {
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(30000);
                    c.setRequestProperty("User-Agent", "NovelReader-Android");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                        u = new URL(new URL(u), c.getHeaderField("Location")).toString();
                        c.disconnect();
                        continue;
                    }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                long total = c.getContentLengthLong() > 0 ? c.getContentLengthLong() : expected;
                long done = 0;
                int lastPct = -1;
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : 0;
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject p = new JSObject();
                            p.put("percent", pct);
                            notifyListeners("progress", p);
                        }
                    }
                }
                if (expected > 0 && done != expected) throw new Exception("Incomplete download (" + done + " / " + expected + ")");
                if (out.exists()) out.delete();
                if (!part.renameTo(out)) throw new Exception("Could not save the update");
                JSObject r = new JSObject();
                r.put("size", done);
                call.resolve(r);
            } catch (Exception e) {
                part.delete();
                call.reject("Download failed: " + e.getMessage());
            }
        }, "nr-update").start();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        r.put("downloaded", apkFile().exists());
        call.resolve(r);
    }

    @PluginMethod
    public void install(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        File f = apkFile();
        if (!f.exists()) { call.reject("No downloaded update"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !c.getPackageManager().canRequestPackageInstalls()) {
            // First time: Android asks to allow NovelReader to install apps.
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(s);
            r.put("needsPermission", true);
            call.resolve(r);
            return;
        }
        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(i);
        r.put("started", true);
        call.resolve(r);
    }
}
