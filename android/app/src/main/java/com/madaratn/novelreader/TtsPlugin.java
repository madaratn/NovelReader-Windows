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
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Read aloud on Android: the phone's own voices (the WebView has none). The reader
 * speaks one paragraph at a time through this plugin (src/platform/android-tts.ts
 * makes it look like the browser's speechSynthesis). While reading, a small service
 * keeps the app alive with the screen off; its notification has a Stop button.
 */
@CapacitorPlugin(name = "Tts")
public class TtsPlugin extends Plugin {
    static TtsPlugin current;
    private TextToSpeech tts;
    private volatile boolean ready;
    private PowerManager.WakeLock wake;

    @Override
    public void load() {
        current = this;
        tts = new TextToSpeech(getContext().getApplicationContext(), status -> {
            ready = status == TextToSpeech.SUCCESS;
            if (ready) tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { event(id, "start", 0, 0); }
                @Override public void onDone(String id) { event(id, "end", 0, 0); }
                @Override public void onError(String id) { event(id, "error", 0, 0); }
                @Override public void onStop(String id, boolean interrupted) { /* cancel(): the interface already knows */ }
                @Override public void onRangeStart(String id, int start, int end, int frame) { event(id, "boundary", start, end); }
            });
            JSObject r = new JSObject();
            r.put("type", "ready");
            notifyListeners("tts", r);
        });
    }

    private void event(String id, String type, int start, int end) {
        JSObject r = new JSObject();
        r.put("id", id); r.put("type", type); r.put("start", start); r.put("end", end);
        notifyListeners("tts", r);
    }

    @PluginMethod
    public void voices(PluginCall call) {
        JSArray list = new JSArray();
        if (ready) try {
            for (Voice v : tts.getVoices()) {
                if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                JSObject o = new JSObject();
                o.put("voiceURI", v.getName());
                o.put("name", v.getLocale().getDisplayName() + (v.isNetworkConnectionRequired() ? " (online)" : ""));
                o.put("lang", v.getLocale().toLanguageTag());
                o.put("localService", !v.isNetworkConnectionRequired());
                list.put(o);
            }
        } catch (Exception ignored) {}
        JSObject r = new JSObject();
        r.put("ready", ready); r.put("voices", list);
        call.resolve(r);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!ready) { call.reject("No voice is available on this device. Install a voice in Android's settings (Text-to-speech)."); return; }
        String text = call.getString("text", "");
        String id = call.getString("id", "0");
        String voice = call.getString("voice", "");
        String lang = call.getString("lang", "");
        try {
            boolean set = false;
            if (!voice.isEmpty()) for (Voice v : tts.getVoices()) if (v.getName().equals(voice)) { tts.setVoice(v); set = true; break; }
            if (!set && !lang.isEmpty()) tts.setLanguage(Locale.forLanguageTag(lang));
            tts.setSpeechRate(call.getFloat("rate", 1f));
            int max = TextToSpeech.getMaxSpeechInputLength();
            if (text.length() > max) text = text.substring(0, max);
            int r = tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), id);
            if (r != TextToSpeech.SUCCESS) { call.reject("The voice could not start."); return; }
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try { if (ready) tts.stop(); } catch (Exception ignored) {}
        call.resolve();
    }

    /** Reading in progress (true) or over (false): keeps the app alive with the screen off. */
    @PluginMethod
    public void hold(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        Context c = getContext().getApplicationContext();
        try {
            Intent i = new Intent(c, TtsService.class);
            if (on) {
                ContextCompat.startForegroundService(c, i);
                if (wake == null) wake = ((PowerManager) c.getSystemService(Context.POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NovelReader:tts");
                if (!wake.isHeld()) wake.acquire(3 * 60 * 60 * 1000L);
            } else {
                c.stopService(i);
                if (wake != null && wake.isHeld()) wake.release();
            }
        } catch (Exception e) { android.util.Log.w("NovelReader", "tts hold: " + e); }
        call.resolve();
    }

    /** "Stop" pressed on the notification. */
    void stopFromNotification() {
        try { if (ready) tts.stop(); } catch (Exception ignored) {}
        JSObject r = new JSObject();
        r.put("type", "stopped");
        notifyListeners("tts", r);
    }

    @Override
    protected void handleOnDestroy() {
        try { tts.shutdown(); } catch (Exception ignored) {}
        try { getContext().stopService(new Intent(getContext(), TtsService.class)); } catch (Exception ignored) {}
        if (wake != null && wake.isHeld()) wake.release();
    }

    public static class TtsService extends Service {
        static final String CHANNEL = "reading";
        static final String STOP = "com.madaratn.novelreader.TTS_STOP";

        @Override
        public int onStartCommand(Intent intent, int flags, int startId) {
            if (intent != null && STOP.equals(intent.getAction())) {
                if (current != null) current.stopFromNotification();
                stopSelf();
                return START_NOT_STICKY;
            }
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.reading_channel), NotificationManager.IMPORTANCE_LOW));
            PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, TtsService.class).setAction(STOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
                .setContentTitle(getString(R.string.reading_running))
                .setOngoing(true).setContentIntent(open)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_media_pause, getString(R.string.reading_stop), stop).build();
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(42, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                else startForeground(42, n);
            } catch (Exception e) { android.util.Log.w("NovelReader", "tts service: " + e); stopSelf(); }
            return START_NOT_STICKY;
        }

        @Override
        public IBinder onBind(Intent intent) { return null; }
    }
}
