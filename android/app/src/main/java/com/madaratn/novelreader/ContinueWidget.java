package com.madaratn.novelreader;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.widget.RemoteViews;

import java.io.File;

/**
 * Home-screen widget "Continue": the last episode or chapter in progress (title,
 * episode, cover). A tap opens the app on it. The page keeps it up to date through
 * WidgetPlugin; nothing runs on a schedule.
 */
public class ContinueWidget extends AppWidgetProvider {
    static final String PREFS = "continueWidget";
    static final String EXTRA = "nrContinue";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static File coverFile(Context c) { return new File(c.getFilesDir(), "widget-cover.png"); }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { refresh(context, manager, ids); }

    static void refreshAll(Context context) {
        AppWidgetManager m = AppWidgetManager.getInstance(context);
        int[] ids = m.getAppWidgetIds(new ComponentName(context, ContinueWidget.class));
        if (ids != null && ids.length > 0) refresh(context, m, ids);
    }

    static void refresh(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences p = prefs(context);
        String title = p.getString("title", ""), sub = p.getString("sub", ""), kind = p.getString("kind", ""), id = p.getString("id", "");
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_continue);
        v.setTextViewText(R.id.widget_title, title.isEmpty() ? context.getString(R.string.app_name) : title);
        v.setTextViewText(R.id.widget_sub, title.isEmpty() ? context.getString(R.string.widget_empty) : sub);
        Bitmap cover = null;
        try { File f = coverFile(context); if (!title.isEmpty() && f.exists()) cover = BitmapFactory.decodeFile(f.getPath()); } catch (Exception ignored) {}
        if (cover != null) v.setImageViewBitmap(R.id.widget_cover, cover); else v.setImageViewResource(R.id.widget_cover, R.mipmap.ic_launcher);
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (!title.isEmpty()) open.putExtra(EXTRA, kind + "|" + id);
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 20, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        manager.updateAppWidget(ids, v);
    }
}
