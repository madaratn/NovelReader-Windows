package com.madaratn.novelreader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps the app alive while videos are being downloaded (the downloads themselves
 * run in the engine): Android shows "Downloading videos" until the last one ends.
 */
public class DownloadService extends Service {
    static final String CHANNEL = "downloads";

    static void set(Context c, boolean active) {
        Intent i = new Intent(c, DownloadService.class);
        try {
            if (active) ContextCompat.startForegroundService(c, i);
            else c.stopService(i);
        } catch (Exception e) {
            // Started while the app is not in front: the download still runs as long as the app lives.
            android.util.Log.w("NovelReader", "download service: " + e);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.downloads_channel), NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(getString(R.string.downloads_running))
            .setOngoing(true).setContentIntent(open).build();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(41, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(41, n);
        } catch (Exception e) { android.util.Log.w("NovelReader", "download service: " + e); stopSelf(); }
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
