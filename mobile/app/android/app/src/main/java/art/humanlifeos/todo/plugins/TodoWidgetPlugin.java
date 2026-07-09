package art.humanlifeos.todo.plugins;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import android.widget.RemoteViews;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import art.humanlifeos.todo.R;
import art.humanlifeos.todo.widget.TodoWidgetProvider;

@CapacitorPlugin(name = "TodoWidget")
public class TodoWidgetPlugin extends Plugin {

    private static final String TAG = "TodoWidget";
    private static final String PREFS_NAME = "TodoWidgetPrefs";
    private static final String KEY_WIDGET_DATA = "widget_today_data";

    /**
     * Receives JSON widget data from the JS layer, writes it to SharedPreferences,
     * and triggers an immediate widget refresh.
     */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        Log.i(TAG, "Plugin.updateWidget() called from JS");

        String data = call.getString("data");
        if (data == null) {
            Log.w(TAG, "Plugin.updateWidget: data is null, rejecting");
            call.reject("'data' parameter is required");
            return;
        }

        Log.i(TAG, "Plugin.updateWidget: received data length=" + data.length());

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_WIDGET_DATA, data).apply();
        Log.i(TAG, "Plugin.updateWidget: written to SharedPreferences");

        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName widgetComponent = new ComponentName(context, TodoWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(widgetComponent);

        Log.i(TAG, "Plugin.updateWidget: found " + (appWidgetIds != null ? appWidgetIds.length : 0) + " widget instances");

        if (appWidgetIds != null && appWidgetIds.length > 0) {
            TodoWidgetProvider.forceUpdate(context, appWidgetManager, appWidgetIds);
        }

        call.resolve();
    }

    @PluginMethod
    public void getWidgetData(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String data = prefs.getString(KEY_WIDGET_DATA, "{}");
        JSObject ret = new JSObject();
        ret.put("data", data);
        call.resolve(ret);
    }

    /**
     * Comprehensive debug info — call this from the app UI to diagnose widget issues.
     * Returns ALL the information needed to understand what's happening.
     */
    @PluginMethod
    public void getDebugInfo(PluginCall call) {
        JSObject result = new JSObject();
        Context context = getContext();

        // 1. SDK / platform info
        result.put("sdkVersion", Build.VERSION.SDK_INT);
        result.put("device", Build.MODEL);
        result.put("manufacturer", Build.MANUFACTURER);

        // 2. AppWidgetManager status
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName component = new ComponentName(context, TodoWidgetProvider.class);
            int[] ids = mgr.getAppWidgetIds(component);
            result.put("widgetManagerOK", true);
            result.put("widgetInstanceCount", ids != null ? ids.length : 0);
            StringBuilder idsStr = new StringBuilder();
            if (ids != null) {
                for (int i = 0; i < ids.length; i++) {
                    if (i > 0) idsStr.append(",");
                    idsStr.append(ids[i]);
                }
            }
            result.put("widgetIds", idsStr.toString());
        } catch (Exception e) {
            result.put("widgetManagerOK", false);
            result.put("widgetManagerError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 3. SharedPreferences status
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String data = prefs.getString(KEY_WIDGET_DATA, null);
            result.put("prefsOK", true);
            result.put("prefsHasData", data != null);
            result.put("prefsDataLength", data != null ? data.length() : 0);
            if (data != null && data.length() <= 500) {
                result.put("prefsData", data);
            } else if (data != null) {
                result.put("prefsData", data.substring(0, 500) + "...(truncated)");
            } else {
                result.put("prefsData", "(null — no data pushed yet)");
            }
        } catch (Exception e) {
            result.put("prefsOK", false);
            result.put("prefsError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 4. Layout resource check
        try {
            int simpleLayoutId = R.layout.todo_widget_simple;
            result.put("simpleLayoutResId", simpleLayoutId);
            result.put("simpleLayoutOK", simpleLayoutId != 0);
        } catch (Exception e) {
            result.put("simpleLayoutOK", false);
            result.put("simpleLayoutError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        try {
            int fullLayoutId = R.layout.todo_widget_layout;
            result.put("fullLayoutResId", fullLayoutId);
            result.put("fullLayoutOK", fullLayoutId != 0);
        } catch (Exception e) {
            result.put("fullLayoutOK", false);
            result.put("fullLayoutError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 5. Drawable resource check
        try {
            int bgId = R.drawable.widget_bg;
            int dotId = R.drawable.dot_blue;
            int circleId = R.drawable.ic_circle;
            int checkId = R.drawable.ic_check_circle;
            result.put("drawable_widget_bg", bgId);
            result.put("drawable_dot_blue", dotId);
            result.put("drawable_ic_circle", circleId);
            result.put("drawable_ic_check_circle", checkId);
            result.put("drawablesOK", bgId != 0 && dotId != 0 && circleId != 0 && checkId != 0);
        } catch (Exception e) {
            result.put("drawablesOK", false);
            result.put("drawablesError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 6. XML appwidget-provider check
        try {
            int xmlId = R.xml.todo_widget_info;
            result.put("appwidgetXmlResId", xmlId);
            result.put("appwidgetXmlOK", xmlId != 0);
        } catch (Exception e) {
            result.put("appwidgetXmlOK", false);
            result.put("appwidgetXmlError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 7. Manifest receiver check
        try {
            ComponentName receiver = new ComponentName(context, TodoWidgetProvider.class);
            int enabled = context.getPackageManager().getComponentEnabledSetting(receiver);
            result.put("receiverComponentName", receiver.flattenToString());
            result.put("receiverEnabledState", enabled == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ? "ENABLED"
                : enabled == PackageManager.COMPONENT_ENABLED_STATE_DISABLED ? "DISABLED"
                : enabled == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT ? "DEFAULT"
                : String.valueOf(enabled));
        } catch (Exception e) {
            result.put("receiverCheckError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 8. Try to instantiate widget provider class
        try {
            Class<?> cls = TodoWidgetProvider.class;
            result.put("providerClassOK", true);
            result.put("providerClassName", cls.getName());
        } catch (Exception e) {
            result.put("providerClassOK", false);
            result.put("providerClassError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 9. Try onUpdate directly
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            ComponentName component = new ComponentName(context, TodoWidgetProvider.class);
            int[] ids = mgr.getAppWidgetIds(component);
            if (ids != null && ids.length > 0) {
                TodoWidgetProvider.forceUpdate(context, mgr, ids);
                result.put("forceUpdateCalled", true);
                result.put("forceUpdateResult", "OK — " + ids.length + " widget(s) updated");
            } else {
                result.put("forceUpdateCalled", false);
                result.put("forceUpdateResult", "No widget instances placed on home screen yet");
            }
        } catch (Exception e) {
            result.put("forceUpdateCalled", false);
            result.put("forceUpdateError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 10. Deep check: read raw layout XML file
        try {
            java.io.InputStream is = context.getResources().openRawResource(R.layout.todo_widget_simple);
            byte[] buf = new byte[2048];
            int len = is.read(buf);
            is.close();
            String xmlContent = new String(buf, 0, len, "UTF-8");
            result.put("rawLayoutReadOK", true);
            result.put("rawLayoutContent", xmlContent);
        } catch (Exception e) {
            result.put("rawLayoutReadOK", false);
            result.put("rawLayoutReadError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 11. Deep check: try XmlResourceParser on layout
        try {
            android.content.res.XmlResourceParser parser = context.getResources().getLayout(R.layout.todo_widget_simple);
            result.put("xmlParserOK", true);
            // Walk the XML to verify it's well-formed
            int eventType;
            int tagCount = 0;
            while ((eventType = parser.next()) != android.content.res.XmlResourceParser.END_DOCUMENT) {
                if (eventType == android.content.res.XmlResourceParser.START_TAG) tagCount++;
            }
            parser.close();
            result.put("xmlParserTagCount", tagCount);
        } catch (Exception e) {
            result.put("xmlParserOK", false);
            result.put("xmlParserError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 12. Deep check: get AppWidgetProviderInfo (what the Launcher reads)
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            android.appwidget.AppWidgetProviderInfo info = mgr.getInstalledProviders()
                .stream()
                .filter(p -> p.provider.getClassName().equals(TodoWidgetProvider.class.getName()))
                .findFirst()
                .orElse(null);
            if (info != null) {
                result.put("appWidgetInfoOK", true);
                result.put("awp_minWidth", info.minWidth);
                result.put("awp_minHeight", info.minHeight);
                result.put("awp_initialLayout", info.initialLayout);
                result.put("awp_resizeMode", info.resizeMode);
                result.put("awp_widgetCategory", info.widgetCategory);
                result.put("awp_updatePeriodMillis", info.updatePeriodMillis);
                result.put("awp_previewImage", info.previewImage);
                result.put("awp_configure", info.configure != null ? info.configure.flattenToString() : "null");
                result.put("awp_description", info.descriptionRes);
            } else {
                result.put("appWidgetInfoOK", false);
                result.put("appWidgetInfoError", "TodoWidgetProvider not found in installed providers list");
            }
        } catch (Exception e) {
            result.put("appWidgetInfoOK", false);
            result.put("appWidgetInfoError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 13. Deep check: validate all drawable resources are actually loadable
        StringBuilder drawableErrors = new StringBuilder();
        int[] drawableIds = { R.drawable.widget_bg, R.drawable.dot_blue, R.drawable.dot_green,
            R.drawable.dot_red, R.drawable.dot_purple, R.drawable.dot_yellow, R.drawable.dot_gray,
            R.drawable.ic_circle, R.drawable.ic_check_circle };
        String[] drawableNames = { "widget_bg", "dot_blue", "dot_green", "dot_red", "dot_purple",
            "dot_yellow", "dot_gray", "ic_circle", "ic_check_circle" };
        boolean allDrawablesLoadable = true;
        for (int i = 0; i < drawableIds.length; i++) {
            try {
                android.graphics.drawable.Drawable d = context.getResources().getDrawable(drawableIds[i]);
                if (d == null) {
                    allDrawablesLoadable = false;
                    drawableErrors.append(drawableNames[i]).append("=null ");
                }
            } catch (Exception e) {
                allDrawablesLoadable = false;
                drawableErrors.append(drawableNames[i]).append("=").append(e.getClass().getSimpleName()).append(" ");
            }
        }
        result.put("allDrawablesLoadable", allDrawablesLoadable);
        if (!allDrawablesLoadable) {
            result.put("drawableLoadErrors", drawableErrors.toString().trim());
        }

        // 14. Deep check: RemoteViews creation from BOTH layouts
        try {
            RemoteViews rv1 = new RemoteViews(context.getPackageName(), R.layout.todo_widget_simple);
            result.put("remoteViewsSimpleOK", rv1 != null);
        } catch (Exception e) {
            result.put("remoteViewsSimpleOK", false);
            result.put("remoteViewsSimpleError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        try {
            RemoteViews rv2 = new RemoteViews(context.getPackageName(), R.layout.todo_widget_layout);
            result.put("remoteViewsFullOK", rv2 != null);
        } catch (Exception e) {
            result.put("remoteViewsFullOK", false);
            result.put("remoteViewsFullError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 15. Check if we can get our app's resources from another context (simulates launcher)
        try {
            android.content.res.Resources res = context.getPackageManager().getResourcesForApplication(context.getPackageName());
            int id = res.getIdentifier("todo_widget_simple", "layout", context.getPackageName());
            result.put("crossContextResOK", id != 0);
            result.put("crossContextResId", id);
        } catch (Exception e) {
            result.put("crossContextResOK", false);
            result.put("crossContextResError", e.getClass().getSimpleName() + ": " + e.getMessage());
        }

        // 16. Read widget provider event log from SharedPreferences
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        result.put("log_onEnabled", prefs.getString("last_onEnabled", "(never called)"));
        result.put("log_onUpdate", prefs.getString("last_onUpdate", "(never called)"));
        result.put("log_onUpdateResult", prefs.getString("last_onUpdate_result", ""));
        result.put("log_onUpdateCrash", prefs.getString("last_onUpdate_crash", ""));
        result.put("last_error", prefs.getString("last_error", "(none)"));

        Log.i(TAG, "getDebugInfo done");
        call.resolve(result);
    }
}
