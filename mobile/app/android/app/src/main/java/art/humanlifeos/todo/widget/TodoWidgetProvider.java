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
            bgClr    = 0xFF1A1728;
            dateClr  = 0xFFE4E0F0;
            wdayClr  = 0xFFA78BFA;
            divClr   = 0xFF2D2945;
            lineClr  = 0xFF3D3870;
            titleClr = 0xFFDDD8F0;
            doneClr  = 0xFF5C5870;
            ovflClr  = 0xFF6B6780;
            emptyClr = 0xFF6B6780;
        } else {
            bgClr    = 0xFFF5F3FF;
            dateClr  = 0xFF1E1B4B;
            wdayClr  = 0xFF7C3AED;
            divClr   = 0xFFE0E7FF;
            lineClr  = 0xFFC7D2FE;
            titleClr = 0xFF1E1B4B;
            doneClr  = 0xFFA5A0C0;
            ovflClr  = 0xFF8B87A8;
            emptyClr = 0xFF8B87A8;
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

    /** Dot fill color from task hex */
    private int dotColorForHex(String hex) {
        if (hex == null) return 0xFF9CA3AF;
        switch (hex.toUpperCase()) {
            case "#007AFF": return 0xFF3B82F6;
            case "#34C759": return 0xFF22C55E;
            case "#FF3B30": return 0xFFEF4444;
            case "#AF52DE": return 0xFFA855F7;
            case "#FFCC00": return 0xFFF59E0B;
            default:        return 0xFF9CA3AF;
        }
    }

    /** Returns [badgeBackground, badgeText] for a task color */
    private int[] badgeColorsForHex(String hex, boolean dark, boolean done) {
        if (done) {
            return dark
                ? new int[]{0xFF2D2A3C, 0xFF6B6780}
                : new int[]{0xFFEDE9F5, 0xFFA5A0C0};
        }
        if (hex == null) hex = "#8E8E93";
        switch (hex.toUpperCase()) {
            case "#007AFF": // Blue
                return dark ? new int[]{0xFF1E3A5F, 0xFF93C5FD}
                            : new int[]{0xFFDBEAFF, 0xFF1E5CD6};
            case "#34C759": // Green
                return dark ? new int[]{0xFF14532D, 0xFF86EFAC}
                            : new int[]{0xFFDCFCE7, 0xFF16A34A};
            case "#FF3B30": // Red
                return dark ? new int[]{0xFF450A0A, 0xFFFCA5A5}
                            : new int[]{0xFFFEE2E2, 0xFFDC2626};
            case "#AF52DE": // Purple
                return dark ? new int[]{0xFF3B0764, 0xFFD8B4FE}
                            : new int[]{0xFFF3E8FF, 0xFF9333EA};
            case "#FFCC00": // Yellow
                return dark ? new int[]{0xFF451A03, 0xFFFDE68A}
                            : new int[]{0xFFFEF3C7, 0xFFB45309};
            default: // Gray
                return dark ? new int[]{0xFF374151, 0xFFD1D5DB}
                            : new int[]{0xFFF3F4F6, 0xFF6B7280};
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
