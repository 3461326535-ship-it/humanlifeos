package art.humanlifeos.todo;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import art.humanlifeos.todo.plugins.TodoWidgetPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // MUST register plugins BEFORE super.onCreate() — the bridge loads them at init time
        registerPlugin(TodoWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        handleWidgetIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleWidgetIntent(intent);
    }

    /**
     * If the activity was launched from a widget task row tap,
     * dispatch a 'widget-task-tap' custom event to the WebView
     * so the React layer can navigate to the task detail page.
     */
    private void handleWidgetIntent(Intent intent) {
        if (intent != null && intent.hasExtra("taskId")) {
            String taskId = intent.getStringExtra("taskId");
            if (taskId != null && getBridge() != null && getBridge().getWebView() != null) {
                String escaped = taskId.replace("'", "\\'");
                String js = "window.dispatchEvent(new CustomEvent('widget-task-tap', { detail: '" + escaped + "' }))";
                getBridge().getWebView().evaluateJavascript(js, null);
            }
        }
    }
}
