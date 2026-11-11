package com.madaratn.novelreader;

import android.app.Application;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Every 6 hours, app closed: asks the video engine how many episodes each title of
 * the library has now, and shows one notification when some have more than before.
 * The library itself is not changed here: the app marks the new episodes when opened.
 */
public class EpisodeCheckWorker extends Worker {
    static final String ENGINE = "http://127.0.0.1:4567";

    public EpisodeCheckWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[32 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    static String get(String url, int timeoutMs) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(5000);
        c.setReadTimeout(timeoutMs);
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream()) { return read(in); }
        } finally { c.disconnect(); }
    }

    /** Number of episodes in the engine's answer ([...] or {"episodes":[...]}). */
    static int count(String body) throws Exception {
        String t = body.trim();
        if (t.startsWith("[")) return new JSONArray(t).length();
        JSONObject o = new JSONObject(t);
        JSONArray a = o.optJSONArray("episodes");
        if (a == null) a = o.optJSONArray("items");
        return a == null ? 0 : a.length();
    }

    /** Titles with more episodes than last seen; [seen] is updated (first sight = no notification). */
    static List<String> compare(JSONArray items, JSONObject seen, java.util.function.Function<JSONObject, Integer> episodes) throws Exception {
        List<String> names = new ArrayList<>();
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.getJSONObject(i);
            String key = it.optString("sourceId") + "|" + it.optString("url");
            Integer now = episodes.apply(it);
            if (now == null || now <= 0) continue;
            int before = seen.has(key) ? seen.getInt(key) : it.optInt("episodes", 0);
            if (before > 0 && now > before) names.add(it.optString("name"));
            seen.put(key, Math.max(now, before));
        }
        return names;
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        try {
            File f = NotifyPlugin.watchFile(c);
            if (!f.exists() || !NotifyPlugin.allowed(c)) return Result.success();
            JSONArray items;
            try (FileInputStream in = new FileInputStream(f)) { items = new JSONArray(read(in)); }
            if (items.length() == 0) return Result.success();
            nr.engine.Engine.INSTANCE.start((Application) c);
            boolean up = false;
            for (int i = 0; i < 60 && !up; i++) { try { get(ENGINE + "/api/v1/health", 3000); up = true; } catch (Exception e) { Thread.sleep(1000); } }
            if (!up) return Result.retry();
            File seenFile = new File(c.getFilesDir(), "watchlist-seen.json");
            JSONObject seen = new JSONObject();
            if (seenFile.exists()) try (FileInputStream in = new FileInputStream(seenFile)) { seen = new JSONObject(read(in)); } catch (Exception ignored) {}
            final long end = System.currentTimeMillis() + 8 * 60 * 1000;
            List<String> names = compare(items, seen, it -> {
                if (System.currentTimeMillis() > end || isStopped()) return null;
                try {
                    return count(get(ENGINE + "/api/v1/anime/" + URLEncoder.encode(it.optString("sourceId"), "UTF-8") + "/episodes?url=" + URLEncoder.encode(it.optString("url"), "UTF-8"), 30000));
                } catch (Exception e) { return null; }
            });
            try (FileOutputStream out = new FileOutputStream(seenFile)) { out.write(seen.toString().getBytes(StandardCharsets.UTF_8)); }
            if (!names.isEmpty()) {
                StringBuilder body = new StringBuilder();
                for (int i = 0; i < Math.min(3, names.size()); i++) { if (i > 0) body.append(", "); body.append(names.get(i)); }
                if (names.size() > 3) body.append("…");
                NotifyPlugin.post(c, 52, c.getResources().getQuantityString(R.plurals.new_episodes, names.size(), names.size()), body.toString());
            }
            return Result.success();
        } catch (Exception e) {
            android.util.Log.w("NovelReader", "episode check: " + e);
            return Result.success();
        }
    }
}
