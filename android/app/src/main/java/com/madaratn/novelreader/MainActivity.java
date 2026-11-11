package com.madaratn.novelreader;

import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.media.AudioManager;
import android.os.Build;
import android.util.Rational;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.widget.TextView;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private int orientationBefore;
    private GestureLayer gestures;
    static MainActivity current;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(PlayerPlugin.class);
        registerPlugin(SyncPlugin.class);
        registerPlugin(NotifyPlugin.class);
        registerPlugin(FilesPlugin.class);
        current = this;
        super.onCreate(savedInstanceState);
        // Video engine (android/engine): http://127.0.0.1:4567, like on the PC.
        // Video downloads keep going with the app in the background (DownloadService).
        final Context appContext = getApplicationContext();
        nr.engine.Engine.INSTANCE.setOnDownloadsActive(active -> DownloadService.set(appContext, active));
        nr.engine.Engine.INSTANCE.start(getApplication());
        // Capacitor closes full-screen video at once; the player needs it.
        bridge.getWebView().setWebChromeClient(new FullscreenClient(bridge));
        // The reader sets its own text size: no automatic enlarging of paragraphs.
        bridge.getWebView().getSettings().setLayoutAlgorithm(android.webkit.WebSettings.LayoutAlgorithm.NORMAL);
    }

    private class FullscreenClient extends BridgeWebChromeClient {
        FullscreenClient(Bridge b) { super(b); }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
            fullscreenView = view;
            fullscreenCallback = callback;
            orientationBefore = getRequestedOrientation();
            view.setBackgroundColor(Color.BLACK);
            gestures = new GestureLayer(MainActivity.this);
            gestures.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            gestures.addView(gestures.label);
            ((ViewGroup) getWindow().getDecorView()).addView(gestures, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            autoPip(true);
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            bars.hide(WindowInsetsCompat.Type.systemBars());
            bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        }

        @Override
        public void onHideCustomView() { exitFullscreen(); }
    }

    private void exitFullscreen() {
        if (fullscreenView == null) return;
        ((ViewGroup) getWindow().getDecorView()).removeView(gestures);
        gestures.removeAllViews();
        gestures = null;
        fullscreenView = null;
        autoPip(false);
        // Screen brightness back to the phone's own setting.
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
        getWindow().setAttributes(lp);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).show(WindowInsetsCompat.Type.systemBars());
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setRequestedOrientation(orientationBefore);
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = null;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (fullscreenView != null) { exitFullscreen(); return; }
        super.onBackPressed();
    }

    // ---- Small floating window (picture in picture) --------------------------------
    // A video in full screen keeps playing in a small window when the person leaves
    // the app (Home, another app); the "Mini player" button does the same at once.
    private PictureInPictureParams pipParams(boolean auto) {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) b.setAutoEnterEnabled(auto).setSeamlessResizeEnabled(true);
        return b.build();
    }

    private void autoPip(boolean on) {
        try { setPictureInPictureParams(pipParams(on)); } catch (Exception ignored) {}
    }

    boolean enterPip() {
        if (fullscreenView == null) return false;
        try { return enterPictureInPictureMode(pipParams(true)); } catch (Exception e) { return false; }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) enterPip();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPip, Configuration newConfig) {
        super.onPictureInPictureModeChanged(inPip, newConfig);
        if (gestures != null) gestures.enabled = !inPip;
        if (!inPip && getLifecycle().getCurrentState() == androidx.lifecycle.Lifecycle.State.CREATED) {
            // The small window was closed (not reopened): stop the sound.
            bridge.getWebView().evaluateJavascript("document.querySelectorAll('video').forEach(function(v){v.pause()})", null);
        }
    }

    // ---- Full-screen gestures: slide up/down, left half = brightness, right = volume ----
    static int step(float start, float dy, float height, int max) {
        // A slide over 60 % of the screen height covers the whole range.
        float v = start + (-dy / (height * 0.6f)) * max;
        return Math.max(0, Math.min(max, Math.round(v)));
    }

    private class GestureLayer extends FrameLayout {
        final TextView label;
        boolean enabled = true;
        private float x0, y0, start;
        private boolean active, left;
        private final int slop;
        private final AudioManager audio;

        GestureLayer(Context c) {
            super(c);
            slop = ViewConfiguration.get(c).getScaledTouchSlop() * 2;
            audio = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            label = new TextView(c);
            label.setTextColor(Color.WHITE);
            label.setTextSize(18);
            label.setBackgroundColor(0xB0000000);
            int p = (int) (12 * c.getResources().getDisplayMetrics().density);
            label.setPadding(p * 2, p, p * 2, p);
            label.setVisibility(View.GONE);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.gravity = Gravity.CENTER_HORIZONTAL | Gravity.TOP;
            lp.topMargin = p * 3;
            label.setLayoutParams(lp);
        }

        @Override
        public boolean onInterceptTouchEvent(MotionEvent e) {
            if (!enabled || e.getPointerCount() > 1) return false;
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
                x0 = e.getX(); y0 = e.getY(); active = false;
                // Not from the edges (system gestures) nor the bottom strip (seek bar).
                float h = getHeight(), w = getWidth();
                if (y0 < h * 0.12f || y0 > h * 0.8f || x0 < w * 0.06f || x0 > w * 0.94f) x0 = -1;
                return false;
            }
            if (e.getActionMasked() == MotionEvent.ACTION_MOVE && x0 >= 0) {
                float dx = Math.abs(e.getX() - x0), dy = Math.abs(e.getY() - y0);
                if (dy > slop && dy > dx * 1.5f) {
                    active = true; left = x0 < getWidth() / 2f; y0 = e.getY();
                    if (left) {
                        float b = getWindow().getAttributes().screenBrightness;
                        if (b < 0) { try { b = android.provider.Settings.System.getInt(getContentResolver(), android.provider.Settings.System.SCREEN_BRIGHTNESS) / 255f; } catch (Exception x) { b = 0.5f; } }
                        start = b * 100;
                    } else start = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
                    return true;
                }
            }
            return false;
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            if (!active) return false;
            int a = e.getActionMasked();
            if (a == MotionEvent.ACTION_MOVE) {
                float dy = e.getY() - y0;
                if (left) {
                    int v = Math.max(1, step(start, dy, getHeight(), 100));
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.screenBrightness = v / 100f;
                    getWindow().setAttributes(lp);
                    show("\u2600 " + v + " %");
                } else {
                    int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    int v = step(start, dy, getHeight(), max);
                    audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0);
                    show("\uD83D\uDD0A " + Math.round(v * 100f / max) + " %");
                }
            } else if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) {
                active = false;
                label.postDelayed(() -> label.setVisibility(View.GONE), 600);
            }
            return true;
        }

        private void show(String text) { label.setText(text); label.setVisibility(View.VISIBLE); }
    }
}
