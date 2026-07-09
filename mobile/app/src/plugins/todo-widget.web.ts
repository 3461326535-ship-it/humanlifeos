import type { TodoWidgetPlugin, WidgetDebugInfo } from './todo-widget';

export class TodoWidgetWeb implements TodoWidgetPlugin {
  async updateWidget(_options: { data: string }): Promise<void> {
    // no-op on web platform
  }
  async getWidgetData(): Promise<{ data: string }> {
    return { data: '{}' };
  }
  async getDebugInfo(): Promise<WidgetDebugInfo> {
    return {
      sdkVersion: 0,
      device: 'web',
      manufacturer: 'web',
      widgetManagerOK: false,
      widgetInstanceCount: 0,
      widgetIds: '',
      prefsOK: false,
      prefsHasData: false,
      prefsDataLength: 0,
      prefsData: '(web platform — no native widget)',
      simpleLayoutOK: false,
      simpleLayoutResId: 0,
      fullLayoutOK: false,
      fullLayoutResId: 0,
      drawablesOK: false,
      drawable_widget_bg: 0,
      drawable_dot_blue: 0,
      drawable_ic_circle: 0,
      drawable_ic_check_circle: 0,
      appwidgetXmlOK: false,
      appwidgetXmlResId: 0,
      receiverComponentName: '',
      receiverEnabledState: 'N/A (web)',
      providerClassOK: false,
      providerClassName: '',
      forceUpdateCalled: false,
      forceUpdateResult: 'Web platform — no widgets',
      rawLayoutReadOK: false,
      xmlParserOK: false,
      appWidgetInfoOK: false,
      allDrawablesLoadable: false,
      remoteViewsSimpleOK: false,
      remoteViewsFullOK: false,
      crossContextResOK: false,
      log_onEnabled: '(web)',
      log_onUpdate: '(web)',
      log_onUpdateResult: '',
      log_onUpdateCrash: '',
      last_error: '',
    };
  }
}
