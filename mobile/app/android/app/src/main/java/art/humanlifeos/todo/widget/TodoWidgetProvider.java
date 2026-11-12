package art.humanlifeos.todo.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.*;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import art.humanlifeos.todo.MainActivity;
import art.humanlifeos.todo.R;

public class TodoWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "TodoWidget";
    private static final String PREFS_NAME = "TodoWidgetPrefs";
    private static final String KEY_DATA = "widget_today_data";
    private static final int MAX_ROWS = 4;

    // ── Layout tokens (dp) ───────────────────────────────────────────
    private static final float DP_PAD          = 16f;
    private static final float DP_CORNER       = 22f;
    private static final float DP_TIMELINE_X   = 22f;   // timeline offset from left
    private static final float DP_DOT_R        = 5f;    // inner dot radius
    private static final float DP_DOT_RING     = 2.5f;  // ring thickness (bg color)
    private static final float DP_LINE_W       = 2f;    // timeline stroke
    private static final float DP_BADGE_HPAD   = 10f;
    private static final float DP_BADGE_VPAD   = 4f;
    private static final float DP_BADGE_RAD    = 16f;
    private static final float DP_GAP          = 8f;    // gap: dot → badge, badge → title, event→event
    private static final float DP_DIVIDER_GAP  = 8f;

    // ── Font sizes (sp) ──────────────────────────────────────────────
    private static final float SP_DATE     = 16f;
    private static final float SP_WEEKDAY  = 11f;
    private static final float SP_TIME     = 12f;
    private static final float SP_TITLE    = 13f;
    private static final float SP_OVERFLOW = 10f;
    private static final float SP_EMPTY    = 13f;

    // ── Lifecycle ────────────────────────────────────────────────────

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        Log.d(TAG, "onUpdate ids=" + java.util.Arrays.toString(ids));

        float density   = context.getResources().getDisplayMetrics().density;
        float fontScale = context.getResources().getDisplayMetrics().scaledDensity;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_DATA, null);

        for (int widgetId : ids) {
            try {
                int[] dims = getWidgetPixelSize(mgr, widgetId, density);
                Bitmap bitmap = renderTimelineWidget(context, dims[0], dims[1], json, density, fontScale);

                RemoteViews views = new RemoteViews(context.getPackageName(),
                    R.layout.todo_widget_layout);
                views.setImageViewBitmap(R.id.widget_bitmap, bitmap);
                attachClickIntent(context, views);

                mgr.updateAppWidget(widgetId, views);
                Log.d(TAG, "onUpdate OK widgetId=" + widgetId + " size=" + dims[0] + "x" + dims[1]);

            } catch (Throwable t) {
                Log.e(TAG, "onUpdate CRASH widgetId=" + widgetId, t);
                String err = t.getClass().getSimpleName() + ": "
                    + (t.getMessage() != null ? t.getMessage() : "null");
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putString("last_error", err).apply();
            }
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr,
                                          int widgetId, Bundle newOptions) {
        onUpdate(context, mgr, new int[]{widgetId});
    }

    @Override public void onEnabled (Context ctx) { Log.d(TAG, "onEnabled");  super.onEnabled(ctx);  }
    @Override public void onDeleted (Context ctx, int[] ids) { Log.d(TAG, "onDeleted"); super.onDeleted(ctx, ids); }
    @Override public void onDisabled(Context ctx) { Log.d(TAG, "onDisabled"); super.onDisabled(ctx); }

    public static void forceUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        Log.d(TAG, "forceUpdate ids=" + java.util.Arrays.toString(ids));
        new TodoWidgetProvider().onUpdate(context, mgr, ids);
    }

    // ══════════════════════════════════════════════════════════════════
    //  Timeline Widget Rendering
    // ══════════════════════════════════════════════════════════════════

    private Bitmap renderTimelineWidget(Context ctx, int wPx, int hPx,
                                         String jsonData, float density, float fontScale) {
        Bitmap bmp = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        boolean dark = isDarkMode(ctx);

        // ── Palette ───────────────────────────────────────────────
        int bgClr, dateClr, wdayClr, divClr, lineClr, titleClr, doneClr, ovflClr, emptyClr;

        if (dark) {
            bgClr    = 0xFF2B2822;
            dateClr  = 0xFFE8E0D0;
            wdayClr  = 0xFFF4746B;
            divClr   = 0xFF3D3830;
            lineClr  = 0xFF4A4538;
            titleClr = 0xFFDDD5C0;
            doneClr  = 0xFF5C5548;
            ovflClr  = 0xFF6B6458;
            emptyClr = 0xFF6B6458;
        } else {
            bgClr    = 0xFFFBF4E6;   // paper
            dateClr  = 0xFF3A352E;   // ink
            wdayClr  = 0xFFF4746B;   // red accent
            divClr   = 0xFFE2D6B8;   // border
            lineClr  = 0xFFE2D6B8;   // divider
            titleClr = 0xFF3A352E;   // ink
            doneClr  = 0xFFC9BEA3;   // icon-gray
            ovflClr  = 0xFF7A7264;   // ink-soft
            emptyClr = 0xFF7A7264;   // ink-soft
        }

        float rad    = DP_CORNER * density;
        float pad    = DP_PAD * density;
        float lineX  = DP_TIMELINE_X * density;       // timeline & dot center X
        float dotR   = DP_DOT_R * density;
        float ringW  = DP_DOT_RING * density;
        float lineW  = DP_LINE_W * density;
        float gap    = DP_GAP * density;

        // ═══ 1. Background ═══
        Paint bgP = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgP.setColor(bgClr);
        c.drawRoundRect(0, 0, wPx, hPx, rad, rad, bgP);

        // ═══ 2. Clip to rounded corners ═══
        c.save();
        Path clip = new Path();
        clip.addRoundRect(0, 0, wPx, hPx, rad, rad, Path.Direction.CW);
        c.clipPath(clip);

        // ═══ 3. Parse JSON ═══
        String datePart = "", weekdayPart = "";
        JSONArray tasks = null;
        int total = 0, completed = 0;
        if (jsonData != null) {
            try {
                JSONObject data = new JSONObject(jsonData);
                String label = data.optString("dateLabel", "");
                // dateLabel is like "7月10日 星期四" — split into date + weekday
                int sp = label.lastIndexOf(' ');
                if (sp > 0) {
                    datePart    = label.substring(0, sp);   // "7月10日"
                    weekdayPart = label.substring(sp + 1);  // "星期四"
                } else {
                    datePart = label;
                }
                tasks     = data.optJSONArray("tasks");
                total     = data.optInt("total", 0);
                completed = data.optInt("completed", 0);
            } catch (Exception e) {
                Log.w(TAG, "JSON parse failed", e);
            }
        }
        if (datePart.isEmpty()) {
            datePart = android.text.format.DateFormat.format("M月d日", new java.util.Date()).toString();
            weekdayPart = "";
        }

        // ═══ 4. Header: date + weekday + divider ═══
        Paint dateP = new Paint(Paint.ANTI_ALIAS_FLAG);
        dateP.setTextSize(SP_DATE * fontScale);
        dateP.setColor(dateClr);
        dateP.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));

        Paint wdayP = new Paint(Paint.ANTI_ALIAS_FLAG);
        wdayP.setTextSize(SP_WEEKDAY * fontScale);
        wdayP.setColor(wdayClr);
        wdayP.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));

        Paint divP = new Paint(Paint.ANTI_ALIAS_FLAG);
        divP.setColor(divClr);
        divP.setStrokeWidth(1f * density);

        float y = pad;
        float dateBase = y + dateP.getTextSize();
        c.drawText(datePart, pad, dateBase, dateP);

        // Weekday next to date
        float dateW = dateP.measureText(datePart);
        float wx = pad + dateW + 8f * density;
        c.drawText(weekdayPart, wx, dateBase, wdayP);

        // Badge "3/7" at top-right
        if (total > 0) {
            String badgeStr = completed + "/" + total;
            Paint badgeP = new Paint(Paint.ANTI_ALIAS_FLAG);
            badgeP.setTextSize(SP_WEEKDAY * 0.9f * fontScale);
            badgeP.setColor(wdayClr);
            badgeP.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
            float bw = badgeP.measureText(badgeStr);
            c.drawText(badgeStr, wPx - pad - bw, dateBase, badgeP);
        }

        // Divider
        y = dateBase + DP_DIVIDER_GAP * density;
        float divY = y + 2f * density;
        c.drawLine(pad, divY, wPx - pad, divY, divP);

        y = divY + DP_DIVIDER_GAP * density;

        // ═══ 5. Collect visible tasks ═══
        // Build ordered list: incomplete first, then completed
        java.util.List<JSONObject> visibleList = new java.util.ArrayList<>();
        if (tasks != null && tasks.length() > 0) {
            try {
                // Pass 1: incomplete
                for (int i = 0; i < tasks.length() && visibleList.size() < MAX_ROWS; i++) {
                    JSONObject t = tasks.getJSONObject(i);
                    if (!t.optBoolean("completed", false)) visibleList.add(t);
                }
                // Pass 2: completed (fill)
                for (int i = 0; i < tasks.length() && visibleList.size() < MAX_ROWS; i++) {
                    JSONObject t = tasks.getJSONObject(i);
                    if (t.optBoolean("completed", false)) visibleList.add(t);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error building task list", e);
            }
        }

        int N = visibleList.size();

        // ═══ 6. Timeline line ═══
        float availH = hPx - y - pad;   // space below header to bottom padding
        float rowH, gapY;

        // Preferred row height — don't stretch when few items
        float prefRowH = 26f * density;
        if (N > 0) {
            int gaps = Math.max(0, N - 1);
            // Use preferred height unless it overflows available space
            float needed = N * prefRowH + gaps * gap;
            if (needed > availH) {
                rowH = (availH - gaps * gap) / N;
                if (rowH < 14f * density) rowH = 14f * density; // absolute minimum
            } else {
                rowH = prefRowH;
            }
            gapY = rowH + gap;

            // Draw timeline from first dot to last dot
            float firstDotY = y + rowH / 2f;
            float lastDotY  = y + (N - 1) * gapY + rowH / 2f;

            Paint lineP = new Paint(Paint.ANTI_ALIAS_FLAG);
            lineP.setColor(lineClr);
            lineP.setStrokeWidth(lineW);
            lineP.setStrokeCap(Paint.Cap.ROUND);
            c.drawLine(lineX, firstDotY, lineX, lastDotY, lineP);
        } else {
            rowH = prefRowH;
            gapY = rowH + gap;
        }

        // ═══ 7. Event rows ═══
        // Configure text paints
        Paint titleP = new Paint(Paint.ANTI_ALIAS_FLAG);
        titleP.setTextSize(SP_TITLE * fontScale);
        titleP.setColor(titleClr);
        titleP.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));

        Paint titleDoneP = new Paint(Paint.ANTI_ALIAS_FLAG);
        titleDoneP.setTextSize(SP_TITLE * fontScale);
        titleDoneP.setColor(doneClr);
        titleDoneP.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));

        Paint timeP = new Paint(Paint.ANTI_ALIAS_FLAG);
        timeP.setTextSize(SP_TIME * fontScale);
        timeP.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));

        // Badge content origin
        float badgeStartX = lineX + dotR + ringW + gap;
        float titleX = badgeStartX;   // title starts at same X as badge, placed after badge
        // Title max width
        float titleMaxW = wPx - pad - titleX;

        int shown = 0;

        for (int i = 0; i < N; i++) {
            JSONObject t = visibleList.get(i);
            boolean done = t.optBoolean("completed", false);
            String title = t.optString("title", "");
            String time  = t.optString("time",  "");
            String hex   = t.optString("color", "#8E8E93");

            float rowY  = y + i * gapY;
            float rowCY = rowY + rowH / 2f;

            // ── 7a. Dot (ring + fill) ──
            // Outer ring = background color (cuts the timeline line)
            Paint ringP = new Paint(Paint.ANTI_ALIAS_FLAG);
            ringP.setColor(bgClr);
            ringP.setStyle(Paint.Style.FILL);
            c.drawCircle(lineX, rowCY, dotR + ringW, ringP);

            // Inner fill = task color
            Paint dotP = new Paint(Paint.ANTI_ALIAS_FLAG);
            dotP.setStyle(Paint.Style.FILL);
            dotP.setColor(done ? (dark ? 0xFF4A4558 : 0xFFD0CCE0) : dotColorForHex(hex));
            c.drawCircle(lineX, rowCY, dotR, dotP);

            // ── 7b. Time badge (pill) ──
            float badgeH = SP_TIME * fontScale + 2f * DP_BADGE_VPAD * density;
            float badgeVOffset = (rowH - badgeH) / 2f;

            if (time != null && !time.isEmpty()) {
                // Measure time text
                int[] badgeColors = badgeColorsForHex(hex, dark, done);
                timeP.setColor(badgeColors[1]);   // text color

                float timeW = timeP.measureText(time);
                float badgeW = timeW + 2f * DP_BADGE_HPAD * density;
                float badgeR = DP_BADGE_RAD * density;

                // Draw badge background
                Paint badgeBg = new Paint(Paint.ANTI_ALIAS_FLAG);
                badgeBg.setColor(badgeColors[0]);   // bg color
                float bL = badgeStartX;
                float bT = rowY + badgeVOffset;
                float bR = bL + badgeW;
                float bB = bT + badgeH;
                c.drawRoundRect(bL, bT, bR, bB, badgeR, badgeR, badgeBg);

                // Draw time text centered in badge
                Paint.FontMetrics bFm = timeP.getFontMetrics();
                float bTextBase = bT + (badgeH - timeP.getTextSize()) / 2f - bFm.ascent;
                float bTextX = bL + DP_BADGE_HPAD * density;
                c.drawText(time, bTextX, bTextBase, timeP);

                // Title starts after badge
                titleX = bR + gap;
                titleMaxW = wPx - pad - titleX;
            } else {
                // No time → title starts at badge position
                titleX = badgeStartX;
                titleMaxW = wPx - pad - titleX;
            }

            // ── 7c. Title ──
            Paint activeTP = done ? titleDoneP : titleP;
            String disp = truncateText(title, activeTP, titleMaxW);

            Paint.FontMetrics tFm = activeTP.getFontMetrics();
            float titleBase = rowY + (rowH - activeTP.getTextSize()) / 2f - tFm.ascent;
            c.drawText(disp, titleX, titleBase, activeTP);

            // Strikethrough for completed
            if (done && !disp.isEmpty()) {
                float sw = activeTP.measureText(disp);
                float stkY = titleBase - activeTP.getTextSize() * 0.3f;
                Paint stkP = new Paint();
                stkP.setColor(activeTP.getColor());
                stkP.setStrokeWidth(Math.max(1f, density * 1f));
                c.drawLine(titleX, stkY, titleX + sw, stkY, stkP);
            }

            shown++;
        }

        // ═══ 8. Overflow / empty ────────────────────────────────────
        int unshown = total - shown;
        float bottomY = (N > 0) ? y + N * gapY - gap : y + 8f * density;

        if (unshown > 0) {
            String ovfl = "还有 " + unshown + " 项…";
            Paint ovP = new Paint(Paint.ANTI_ALIAS_FLAG);
            ovP.setTextSize(SP_OVERFLOW * fontScale);
            ovP.setColor(ovflClr);
            ovP.setTypeface(Typeface.create("sans-serif", Typeface.ITALIC));
            c.drawText(ovfl, lineX, bottomY + ovP.getTextSize(), ovP);
        } else if (shown == 0) {
            String empty = "今天没有任务";
            Paint empP = new Paint(Paint.ANTI_ALIAS_FLAG);
            empP.setTextSize(SP_EMPTY * fontScale);
            empP.setColor(emptyClr);
            empP.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
            float ew = empP.measureText(empty);
            // Use center of the remaining area
            float cy = y + (availH) / 2f + empP.getTextSize() / 2f;
            c.drawText(empty, (wPx - ew) / 2f, cy, empP);
        }

        c.restore();   // clip
        return bmp;
    }

    // ── Color helpers ────────────────────────────────────────────────

    /** Dot fill color from task hex — sketch palette */
    private int dotColorForHex(String hex) {
        if (hex == null) return 0xFFC9BEA3;
        switch (hex.toUpperCase()) {
            case "#5FB8E8": return 0xFF5FB8E8;   // sky
            case "#8CC152": return 0xFF8CC152;   // green
            case "#F4746B": return 0xFFF4746B;   // red
            case "#B58BE0": return 0xFFB58BE0;   // purple
            case "#FFC93C": return 0xFFFFC93C;   // yellow
            case "#C9BEA3": return 0xFFC9BEA3;   // gray
            default:        return 0xFFC9BEA3;
        }
    }

    /** Returns [badgeBackground, badgeText] for a task color — sketch palette */
    private int[] badgeColorsForHex(String hex, boolean dark, boolean done) {
        if (done) {
            return dark
                ? new int[]{0xFF2D2A22, 0xFF6B6458}
                : new int[]{0xFFF3E9D2, 0xFFC9BEA3};
        }
        if (hex == null) hex = "#C9BEA3";
        switch (hex.toUpperCase()) {
            case "#5FB8E8": // Sky
                return dark ? new int[]{0xFF1A3A4A, 0xFF93D8F8}
                            : new int[]{0xFFE0F2FE, 0xFF3B82C4};
            case "#8CC152": // Green
                return dark ? new int[]{0xFF1A3A1A, 0xFFA3D96A}
                            : new int[]{0xFFE7F6E0, 0xFF6B9E38};
            case "#F4746B": // Red
                return dark ? new int[]{0xFF3A1515, 0xFFF4A098}
                            : new int[]{0xFFFFE4E1, 0xFFD44944};
            case "#B58BE0": // Purple
                return dark ? new int[]{0xFF2A1540, 0xFFD4B8F0}
                            : new int[]{0xFFF2E4FF, 0xFF8B5CC0};
            case "#FFC93C": // Yellow
                return dark ? new int[]{0xFF352A00, 0xFFFFE088}
                            : new int[]{0xFFFFF4D0, 0xFFC89820};
            default: // Gray
                return dark ? new int[]{0xFF333028, 0xFFD1CBB8}
                            : new int[]{0xFFF3E9D2, 0xFF8B8474};
        }
    }

    // ── General helpers ──────────────────────────────────────────────

    private int[] getWidgetPixelSize(AppWidgetManager mgr, int widgetId, float density) {
        int wDp = 0, hDp = 0;
        Bundle opts = mgr.getAppWidgetOptions(widgetId);
        if (opts != null) {
            wDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH,  0);
            hDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        }
        if (wDp <= 0) wDp = 250;
        if (hDp <= 0) hDp = 180;
        return new int[]{Math.round(wDp * density), Math.round(hDp * density)};
    }

    private void attachClickIntent(Context ctx, RemoteViews views) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        views.setOnClickPendingIntent(R.id.widget_root,
            PendingIntent.getActivity(ctx, 0, intent, flags));
    }

    private boolean isDarkMode(Context ctx) {
        int night = ctx.getResources().getConfiguration().uiMode
            & Configuration.UI_MODE_NIGHT_MASK;
        return night == Configuration.UI_MODE_NIGHT_YES;
    }

    private String truncateText(String text, Paint paint, float maxWidth) {
        if (text == null || text.isEmpty()) return "";
        if (paint.measureText(text) <= maxWidth) return text;
        String ellipsis = "…";
        float ellW = paint.measureText(ellipsis);
        float avail = maxWidth - ellW;
        int lo = 0, hi = text.length();
        while (lo < hi) {
            int mid = (lo + hi + 1) >>> 1;
            if (paint.measureText(text.substring(0, mid)) <= avail) lo = mid;
            else hi = mid - 1;
        }
        return text.substring(0, lo) + ellipsis;
    }
}
