import { useState } from 'react';
import { Bug, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import TodoWidget from '@/plugins/todo-widget';
import type { WidgetDebugInfo } from '@/plugins/todo-widget';

export default function WidgetDebugPanel() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<WidgetDebugInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function fetchDebugInfo() {
    setLoading(true);
    setError('');
    try {
      const result = await TodoWidget.getDebugInfo();
      setInfo(result);
    } catch (e: any) {
      setError(e?.message || String(e));
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }

  function Ok({ ok }: { ok: boolean }) {
    return ok
      ? <CheckCircle size={12} className="text-[var(--green)] inline mr-1 shrink-0" />
      : <XCircle size={12} className="text-[var(--red)] inline mr-1 shrink-0" />;
  }

  function Row({ label, ok, children }: { label: string; ok: boolean; children: React.ReactNode }) {
    return (
      <div className={`rounded p-1.5 ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
        <p className="text-[11px] font-semibold"><Ok ok={ok} />{label}</p>
        <div className="text-[10px] font-mono ml-4">{children}</div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); if (!info) fetchDebugInfo(); }}
        className="w-full flex items-center px-4 py-4 text-left transition-colors border-b border-[var(--divider)] active:bg-[#F5F5F7]"
      >
        <div className="w-8 h-8 rounded-full bg-[var(--yellow)] flex items-center justify-center mr-3 shrink-0">
          <Bug size={16} strokeWidth={2} className="text-white" />
        </div>
        <span className="flex-1 text-[16px] text-[var(--text-primary)]">Widget 调试</span>
        <span className="text-[12px] text-[var(--text-tertiary)]">诊断</span>
      </button>

      {open && (
        <div className="px-3 py-3 bg-[#F8F8FA] border-b border-[var(--divider)] max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2 sticky top-0 bg-[#F8F8FA] py-1 z-10">
            <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Widget 深度学习诊断</h3>
            <div className="flex gap-1">
              <button onClick={fetchDebugInfo} disabled={loading}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[var(--primary-blue)] text-white disabled:opacity-50">
                <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />刷新
              </button>
              <button onClick={() => setOpen(false)}
                className="px-2 py-0.5 rounded text-[10px] bg-gray-300 text-gray-700">关闭</button>
            </div>
          </div>

          {loading && <p className="text-[12px] text-center py-4">读取中...</p>}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2 mb-2">
              <p className="text-[12px] text-[var(--red)] font-bold">{error}</p>
            </div>
          )}

          {info && (
            <div className="space-y-1">
              {/* ── Platform ── */}
              <div className="bg-white rounded p-1.5">
                <p className="text-[10px] text-[var(--text-tertiary)]">SDK {info.sdkVersion} | {info.manufacturer} {info.device}</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">Widget实例: {info.widgetInstanceCount} | IDs: [{info.widgetIds}] | Receiver: {info.receiverEnabledState}</p>
              </div>

              {/* ── SharedPreferences ── */}
              <Row label="SharedPreferences" ok={info.prefsOK && info.prefsHasData}>
                {info.prefsHasData
                  ? <span className="text-[var(--green)]">数据存在 ({info.prefsDataLength}B)</span>
                  : <span className="text-[var(--red)]">无数据！App未推送</span>}
                {info.prefsData && <p className="break-all mt-0.5 text-[9px] text-[var(--text-tertiary)] max-h-12 overflow-hidden">{info.prefsData}</p>}
              </Row>

              {/* ── RemoteViews 创建（最关键） ── */}
              <Row label="RemoteViews(极简布局)" ok={info.remoteViewsSimpleOK}>
                {info.remoteViewsSimpleOK
                  ? <span className="text-[var(--green)]">创建成功</span>
                  : <span className="text-[var(--red)]">{info.remoteViewsSimpleError}</span>}
              </Row>

              <Row label="RemoteViews(完整布局)" ok={info.remoteViewsFullOK}>
                {info.remoteViewsFullOK
                  ? <span className="text-[var(--green)]">创建成功</span>
                  : <span className="text-[var(--red)]">{info.remoteViewsFullError}</span>}
              </Row>

              {/* ── 原始布局文件读取 ── */}
              <Row label="读取布局XML文件" ok={info.rawLayoutReadOK}>
                {info.rawLayoutContent && (
                  <pre className="text-[8px] text-[var(--text-tertiary)] mt-0.5 max-h-20 overflow-hidden whitespace-pre-wrap">{info.rawLayoutContent}</pre>
                )}
                {info.rawLayoutReadError && <span className="text-[var(--red)]">{info.rawLayoutReadError}</span>}
              </Row>

              {/* ── XML Parser ── */}
              <Row label="XmlResourceParser" ok={info.xmlParserOK}>
                {info.xmlParserOK
                  ? <span className="text-[var(--green)]">解析OK, {info.xmlParserTagCount} 个标签</span>
                  : <span className="text-[var(--red)]">{info.xmlParserError}</span>}
              </Row>

              {/* ── Drawable 加载测试 ── */}
              <Row label="Drawable 实际加载" ok={info.allDrawablesLoadable}>
                {info.allDrawablesLoadable
                  ? <span className="text-[var(--green)]">全部9个drawable加载成功</span>
                  : <span className="text-[var(--red)]">失败: {info.drawableLoadErrors}</span>}
              </Row>

              {/* ── AppWidgetProviderInfo (Launcher视角) ── */}
              <Row label="AppWidgetProviderInfo (系统注册信息)" ok={info.appWidgetInfoOK}>
                {info.appWidgetInfoOK ? (
                  <div className="text-[9px]">
                    <p>minW={info.awp_minWidth} minH={info.awp_minHeight}</p>
                    <p>initialLayout=0x{(info.awp_initialLayout ?? 0).toString(16)}</p>
                    <p>resizeMode={info.awp_resizeMode} widgetCategory={info.awp_widgetCategory}</p>
                    <p>previewImage=0x{(info.awp_previewImage ?? 0).toString(16)} configure={info.awp_configure}</p>
                    <p>updatePeriod={info.awp_updatePeriodMillis}ms descLabel={info.awp_description}</p>
                  </div>
                ) : (
                  <span className="text-[var(--red)]">找不到！Widget 可能未被系统注册</span>
                )}
              </Row>

              {/* ── 跨进程资源访问（模拟Launcher） ── */}
              <Row label="跨进程资源访问（模拟Launcher）" ok={info.crossContextResOK}>
                {info.crossContextResOK
                  ? <span className="text-[var(--green)]">ResId={info.crossContextResId}</span>
                  : <span className="text-[var(--red)]">{info.crossContextResError}</span>}
              </Row>

              {/* ── 资源 ID ── */}
              <div className="bg-white rounded p-1.5">
                <p className="text-[9px] text-[var(--text-tertiary)]">
                  简单布局={info.simpleLayoutResId} 完整布局={info.fullLayoutResId}
                  {' '}widget_bg={info.drawable_widget_bg} xml={info.appwidgetXmlResId}
                </p>
                <p className="text-[9px] text-[var(--text-tertiary)]">
                  receiver={info.receiverComponentName} provider={info.providerClassName}
                </p>
              </div>

              {/* ── Widget 生命周期日志 ── */}
              <div className="bg-yellow-50 rounded p-1.5">
                <p className="text-[10px] font-semibold text-[var(--text-primary)] mb-0.5">Widget 生命周期日志</p>
                <p className="text-[9px] font-mono">onEnabled: {info.log_onEnabled || '(未知)'}</p>
                <p className="text-[9px] font-mono">onUpdate: {info.log_onUpdate || '(未知)'}</p>
                <p className="text-[9px] font-mono">super.onUpdate: {info.log_onUpdateResult || '(未知)'}</p>
                <p className="text-[9px] font-mono font-bold text-[var(--red)]">崩溃: {info.log_onUpdateCrash || '(无)'}</p>
              </div>

              {/* ── 最新错误 ── */}
              <div className={`rounded p-1.5 ${info.last_error ? 'bg-red-50' : 'bg-green-50'}`}>
                <p className="text-[10px] font-semibold">
                  最新 onUpdate 错误: {info.last_error ? <XCircle size={12} className="text-[var(--red)] inline" /> : <CheckCircle size={12} className="text-[var(--green)] inline" />}
                </p>
                <p className="text-[9px] font-mono mt-0.5">{info.last_error || '(无错误)'}</p>
              </div>

              {/* ── forceUpdate ── */}
              <Row label="forceUpdate 实测" ok={info.forceUpdateCalled}>
                <span>{info.forceUpdateResult}</span>
                {info.forceUpdateError && <span className="text-[var(--red)]">{info.forceUpdateError}</span>}
              </Row>
            </div>
          )}
        </div>
      )}
    </>
  );
}
