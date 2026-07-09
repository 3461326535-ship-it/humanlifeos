import { registerPlugin } from '@capacitor/core';

export interface TaskWidgetItem {
  id: string;
  title: string;
  time: string;
  color: string;
  completed: boolean;
}

export interface WidgetData {
  dateLabel: string;
  dateIso: string;
  tasks: TaskWidgetItem[];
  total: number;
  completed: number;
}

export interface WidgetDebugInfo {
  sdkVersion: number;
  device: string;
  manufacturer: string;
  widgetManagerOK: boolean;
  widgetInstanceCount: number;
  widgetIds: string;
  widgetManagerError?: string;
  prefsOK: boolean;
  prefsHasData: boolean;
  prefsDataLength: number;
  prefsData: string;
  prefsError?: string;
  simpleLayoutOK: boolean;
  simpleLayoutResId: number;
  simpleLayoutError?: string;
  fullLayoutOK: boolean;
  fullLayoutResId: number;
  fullLayoutError?: string;
  drawablesOK: boolean;
  drawable_widget_bg: number;
  drawable_dot_blue: number;
  drawable_ic_circle: number;
  drawable_ic_check_circle: number;
  drawablesError?: string;
  appwidgetXmlOK: boolean;
  appwidgetXmlResId: number;
  appwidgetXmlError?: string;
  receiverComponentName: string;
  receiverEnabledState: string;
  receiverCheckError?: string;
  providerClassOK: boolean;
  providerClassName: string;
  providerClassError?: string;
  forceUpdateCalled: boolean;
  forceUpdateResult: string;
  forceUpdateError?: string;
  // Deep checks
  rawLayoutReadOK: boolean;
  rawLayoutContent?: string;
  rawLayoutReadError?: string;
  xmlParserOK: boolean;
  xmlParserTagCount?: number;
  xmlParserError?: string;
  appWidgetInfoOK: boolean;
  awp_minWidth?: number;
  awp_minHeight?: number;
  awp_initialLayout?: number;
  awp_resizeMode?: number;
  awp_widgetCategory?: number;
  awp_updatePeriodMillis?: number;
  awp_previewImage?: number;
  awp_configure?: string;
  awp_description?: number;
  appWidgetInfoError?: string;
  allDrawablesLoadable: boolean;
  drawableLoadErrors?: string;
  remoteViewsSimpleOK: boolean;
  remoteViewsSimpleError?: string;
  remoteViewsFullOK: boolean;
  remoteViewsFullError?: string;
  crossContextResOK: boolean;
  crossContextResId?: number;
  crossContextResError?: string;
  // Widget lifecycle log (written by TodoWidgetProvider to SharedPreferences)
  log_onEnabled: string;
  log_onUpdate: string;
  log_onUpdateResult: string;
  log_onUpdateCrash: string;
  last_error: string;
}

export interface TodoWidgetPlugin {
  /** Push today's schedule data from JS to native SharedPreferences and trigger widget refresh */
  updateWidget(options: { data: string }): Promise<void>;
  /** Read the widget data currently stored in SharedPreferences */
  getWidgetData(): Promise<{ data: string }>;
  /** Comprehensive debug info for diagnosing widget issues */
  getDebugInfo(): Promise<WidgetDebugInfo>;
}

const TodoWidget = registerPlugin<TodoWidgetPlugin>('TodoWidget', {
  web: () => import('./todo-widget.web').then(m => new m.TodoWidgetWeb()),
});

export default TodoWidget;
