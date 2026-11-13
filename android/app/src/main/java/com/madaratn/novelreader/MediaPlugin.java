package com.madaratn.novelreader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The video playing in the app, as Android shows any media player: controls in the
 * notification shade and on the lock screen (previous / play-pause / next), and the
 * buttons of headphones, Bluetooth headsets and car stereos.
 * The page tells what plays (update) and gets back the buttons pressed ("action").
 *
 * update({title, artist, art, playing, position, duration, hasNext, hasPrev}); clear()
 */
@CapacitorPlugin(name = "Media")
public class MediaPlugin extends Plugin {
    static final String CHANNEL = "playback";
    static final int ID = 43;
    static final String ACTION = "com.madaratn.novelreader.MEDIA_ACTION";
    private MediaSession session;
    private BroadcastReceiver receiver;
    private final Handler main = new Handler(Looper.getMainLooper());
    private String artUrl = "";
    private Bitmap art;
    private String title = "", artist = "";
    private boolean playing, hasNext, hasPrev;
    private long position, duration;

    @Override
    public void load() {
        session = new MediaSession(getContext(), "NovelReader");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { send("play", -1); }
            @Override public void onPause() { send("pause", -1); }
            @Override public void onSkipToNext() { send("next", -1); }
            @Override public void onSkipToPrevious() { send("prev", -1); }
            @Override public void onSeekTo(long pos) { send("seek", pos); }
            @Override public void onFastForward() { send("forward", -1); }
            @Override public void onRewind() { send("backward", -1); }
            @Override public void onStop() { send("pause", -1); }
        });
        Intent open = new Intent(getContext(), MainActivity.class);
        session.setSessionActivity(PendingIntent.getActivity(getContext(), 10, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) { send(i.getStringExtra("a"), -1); }
        };
        IntentFilter f = new IntentFilter(ACTION);
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED);
        else getContext().registerReceiver(receiver, f);
    }

    private void send(String action, long pos) {
        if (action == null) return;
        JSObject r = new JSObject();
        r.put("action", action);
        if (pos >= 0) r.put("position", pos / 1000.0);
        notifyListeners("action", r);
    }

    @PluginMethod
    public void update(PluginCall call) {
        title = call.getString("title", "");
        artist = call.getString("artist", "");
        playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        hasNext = Boolean.TRUE.equals(call.getBoolean("hasNext", false));
        hasPrev = Boolean.TRUE.equals(call.getBoolean("hasPrev", false));
        position = (long) (call.getDouble("position", 0.0) * 1000);
        duration = (long) (call.getDouble("duration", 0.0) * 1000);
        String url = call.getString("art", "");
        if (url == null) url = "";
        if (!url.equals(artUrl)) { artUrl = url; art = null; if (url.startsWith("https://") || url.startsWith("http://")) loadArt(url); }
        main.post(this::publish);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        main.post(() -> {
            try { session.setActive(false); } catch (Exception ignored) {}
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            nm.cancel(ID);
        });
        call.resolve();
    }

    private void loadArt(final String url) {
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(6000); c.setReadTimeout(8000);
                try (InputStream in = c.getInputStream()) {
                    Bitmap b = BitmapFactory.decodeStream(in);
                    if (b != null && b.getWidth() > 512) b = Bitmap.createScaledBitmap(b, 512, Math.max(1, b.getHeight() * 512 / b.getWidth()), true);
                    final Bitmap done = b;
                    main.post(() -> { if (url.equals(artUrl)) { art = done; publish(); } });
                }
            } catch (Exception ignored) {}
        }).start();
    }

    private PendingIntent button(String a, int code) {
        Intent i = new Intent(ACTION).setPackage(getContext().getPackageName()).putExtra("a", a);
        return PendingIntent.getBroadcast(getContext(), code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void publish() {
        try {
            MediaMetadata.Builder m = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, duration);
            if (art != null) m.putBitmap(MediaMetadata.METADATA_KEY_ART, art);
            session.setMetadata(m.build());
            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_REWIND;
            if (hasNext) actions |= PlaybackState.ACTION_SKIP_TO_NEXT;
            if (hasPrev) actions |= PlaybackState.ACTION_SKIP_TO_PREVIOUS;
            session.setPlaybackState(new PlaybackState.Builder().setActions(actions)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, position, playing ? 1f : 0f).build());
            session.setActive(true);

            Context c = getContext();
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, c.getString(R.string.playback_channel), NotificationManager.IMPORTANCE_LOW));
            Notification.Builder n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title).setContentText(artist)
                .setContentIntent(session.getController().getSessionActivity())
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(playing).setShowWhen(false).setOnlyAlertOnce(true);
            if (art != null) n.setLargeIcon(art);
            int shown = 0;
            int[] compact;
            if (hasPrev) { n.addAction(new Notification.Action.Builder(Icon.createWithResource(c, android.R.drawable.ic_media_previous), c.getString(R.string.media_prev), button("prev", 1)).build()); shown++; }
            n.addAction(new Notification.Action.Builder(Icon.createWithResource(c, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play), c.getString(playing ? R.string.media_pause : R.string.media_play), button(playing ? "pause" : "play", 2)).build());
            int playIndex = shown; shown++;
            if (hasNext) { n.addAction(new Notification.Action.Builder(Icon.createWithResource(c, android.R.drawable.ic_media_next), c.getString(R.string.media_next), button("next", 3)).build()); shown++; }
            compact = shown == 3 ? new int[]{0, 1, 2} : shown == 2 ? new int[]{0, 1} : new int[]{playIndex};
            n.setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(compact));
            nm.notify(ID, n.build());
        } catch (Exception e) { android.util.Log.w("NovelReader", "media: " + e); }
    }

    @Override
    protected void handleOnDestroy() {
        try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
        try { session.release(); } catch (Exception ignored) {}
        try { ((NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE)).cancel(ID); } catch (Exception ignored) {}
    }
}
