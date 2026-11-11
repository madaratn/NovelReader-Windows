package com.madaratn.novelreader;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Notifications for new episodes / chapters: shown by the interface while the app
 * lives, and by a check every 6 hours (EpisodeCheckWorker) when it is closed.
 */
@CapacitorPlugin(name = "Notify", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class NotifyPlugin extends Plugin {
    static final String CHANNEL = "news";
    static final String WORK = "episode-check";

    static File watchFile(Context c) { return new File(c.getFilesDir(), "watchlist.json"); }

    static boolean allowed(Context c) { return NotificationManagerCompat.from(c).areNotificationsEnabled(); }

    static void post(Context c, int id, String title, String body) {
        if (!allowed(c)) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, c.getString(R.string.news_channel), NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open = PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        nm.notify(id, new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title).setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true).setContentIntent(open).build());
    }

    private JSObject state() {
        JSObject r = new JSObject();
        r.put("granted", allowed(getContext()));
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) { call.resolve(state()); }

    /** Asks Android's permission once (Android 13+); older versions allow it already. */
    @PluginMethod
    public void request(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) requestPermissionForAlias("notifications", call, "asked");
        else call.resolve(state());
    }

    @PermissionCallback
    private void asked(PluginCall call) { call.resolve(state()); }

    @PluginMethod
    public void show(PluginCall call) {
        post(getContext(), call.getInt("id", 51), call.getString("title", "NovelReader"), call.getString("body", ""));
        call.resolve(state());
    }

    /** The titles to check while the app is closed ([] or enabled=false stops the check). */
    @PluginMethod
    public void watch(PluginCall call) {
        String items = call.getString("items", "[]");
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        try (FileOutputStream out = new FileOutputStream(watchFile(getContext()))) { out.write(items.getBytes(StandardCharsets.UTF_8)); }
        catch (Exception e) { call.reject(String.valueOf(e.getMessage())); return; }
        WorkManager wm = WorkManager.getInstance(getContext());
        if (!enabled || items.length() < 5) wm.cancelUniqueWork(WORK);
        else wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(EpisodeCheckWorker.class, 6, TimeUnit.HOURS)
                .setInitialDelay(6, TimeUnit.HOURS)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());
        call.resolve(state());
    }
}
