import { useState, useCallback, useRef, useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import TabBar from '@/components/TabBar';
import TodayPage from '@/pages/TodayPage';
import CalendarPage from '@/pages/CalendarPage';
import StatsPage from '@/pages/StatsPage';
import AIChatPage from '@/pages/AIChatPage';
import ProfilePage from '@/pages/ProfilePage';
import { useTasks } from '@/hooks/useTasks';
import { useNotifications } from '@/hooks/useNotifications';
import { useWidgetSync } from '@/hooks/useWidgetSync';
import {
  generateDailyReport,
  generateWeeklyReport,
  saveReportToChat,
  scheduleReportNotifications,
} from '@/lib/scheduledReports';
import type { TabId, Task, Category } from '@/types';

// ── 模块级 CSV 工具（避免闭包捕获问题）──

function csvEscape(val: string): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const CSV_HEADERS = ['标题', '日期', '时间', '分类', '描述', '是否完成', '重复类型', '子任务(用;分隔)'];

function buildCSVContent(tasks: Task[], categories: Category[], includeData: boolean): string {
  const BOM = '﻿';
  const lines: string[] = [];
  lines.push(CSV_HEADERS.map(csvEscape).join(','));

  if (includeData && tasks.length > 0) {
    for (const t of tasks) {
      const cat = categories.find(c => c.id === t.categoryId);
      const row = [
        t.title,
        t.date,
        t.time,
        cat?.name || '其他',
        t.description || '',
        t.completed ? '是' : '否',
        t.recurrence || '',
        (t.subtasks || []).map(st => `${st.title}(${st.completed ? '✓' : '✗'})`).join('; '),
      ];
      lines.push(row.map(csvEscape).join(','));
    }
  }

  return BOM + lines.join('\n');
}

// 解析 CSV 行（支持引号包裹的字段）
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const {
    tasks,
    categories,
    addTask,
    updateTask,
    toggleTask,
    toggleSubtask,
    addCategory,
    updateCategory,
    deleteCategory,
    deleteTask,
    deleteTaskChain,
    getCategoryColor,
    getCategoryName,
    getCategoryStats,
    syncStatus,
    syncNow,
  } = useTasks();

  // 切换 tab 时主动刷新数据
  const handleTabChange = useCallback(
    (tab: TabId) => {
      setActiveTab(tab);
      syncNow();
    },
    [syncNow]
  );

  // ── Widget 同步：每次 tasks/categories 变更时推送到桌面小组件 ──
  useWidgetSync(tasks, categories);

  // ── 监听来自桌面 Widget 的任务点击事件 ──
  useEffect(() => {
    const handler = (e: Event) => {
      const taskId = (e as CustomEvent).detail as string;
      if (taskId) {
        setActiveTab('today');
        // 通过 open-task 事件通知 TodayPage 打开任务详情
        window.dispatchEvent(new CustomEvent('open-task', { detail: taskId }));
      }
    };
    window.addEventListener('widget-task-tap', handler);
    return () => window.removeEventListener('widget-task-tap', handler);
  }, []);

  // 启动时调度日报/周报系统通知
  useEffect(() => {
    scheduleReportNotifications();
  }, []);

  // 监听通知点击：用户点击日报/周报通知时自动生成报告
  useEffect(() => {
    const handler = async (action: any) => {
      const notifType = action.notification?.extra?.type;
      if (notifType === 'daily-report') {
        try {
          const report = await generateDailyReport();
          saveReportToChat(report);
          setActiveTab('assistant'); // 切换到 AI 助手 tab 查看完整报告
        } catch {
          // 静默失败，用户可手动查看
        }
      } else if (notifType === 'weekly-report') {
        try {
          const report = await generateWeeklyReport();
          saveReportToChat(report);
          setActiveTab('assistant');
        } catch {
          // 静默失败
        }
      }
      // 重新调度下一次通知
      scheduleReportNotifications();
    };

    LocalNotifications.addListener('localNotificationActionPerformed', handler);
    return () => {
      LocalNotifications.removeAllListeners?.();
    };
  }, []);

  // Notification system
  const {
    settings: notifySettings,
    permission: notifyPermission,
    updateSetting,
    requestPermission: requestNotifyPermission,
    testNotify,
  } = useNotifications(tasks);

  const handleUpdateNotifySetting = useCallback(
    (key: 'taskStart' | 'dailySummary' | 'deadlineReminder' | 'weeklyReport') => {
      updateSetting(key, !notifySettings[key]);
    },
    [notifySettings, updateSetting]
  );

  // ── 触发文件下载（使用 React ref 管理的 <a> 节点，不直接操作 DOM）──
  const triggerDownload = useCallback((csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    if (downloadRef.current) {
      downloadRef.current.href = url;
      downloadRef.current.download = filename;
      downloadRef.current.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }, []);

  // Export 数据为 CSV
  const handleExport = useCallback(() => {
    const csv = buildCSVContent(tasks, categories, true);
    triggerDownload(csv, `schedule-export-${new Date().toISOString().slice(0, 10)}.csv`);
  }, [tasks, categories, triggerDownload]);

  // 下载导入模板（只有表头）
  const handleDownloadTemplate = useCallback(() => {
    const csv = buildCSVContent(tasks, categories, false);
    triggerDownload(csv, 'schedule-import-template.csv');
  }, [tasks, categories, triggerDownload]);

  // Import data from CSV file
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          // 去掉 BOM
          const cleanText = text.replace(/^﻿/, '');
          const lines = cleanText.split(/\r?\n/).filter(l => l.trim());
          if (lines.length < 1) {
            alert('文件为空，请检查文件内容');
            return;
          }

          // 解析表头
          const headers = parseCSVLine(lines[0]);
          const titleIdx = headers.findIndex(h => h.includes('标题'));
          const dateIdx = headers.findIndex(h => h.includes('日期'));
          const timeIdx = headers.findIndex(h => h.includes('时间'));
          const catIdx = headers.findIndex(h => h.includes('分类'));
          const descIdx = headers.findIndex(h => h.includes('描述'));
          // doneIdx 用于将来支持导入完成状态
          const recurIdx = headers.findIndex(h => h.includes('重复'));
          const subIdx = headers.findIndex(h => h.includes('子任务'));

          if (titleIdx === -1 || dateIdx === -1) {
            alert('文件格式不正确，缺少"标题"或"日期"列。请下载模板参考格式。');
            return;
          }

          // 解析数据行
          let imported = 0;
          const dataRows = lines.slice(1);
          for (const line of dataRows) {
            const cols = parseCSVLine(line);
            const title = cols[titleIdx]?.trim();
            const date = cols[dateIdx]?.trim();
            if (!title || !date) continue;

            const time = timeIdx >= 0 ? (cols[timeIdx]?.trim() || '09:00') : '09:00';
            const catName = catIdx >= 0 ? (cols[catIdx]?.trim() || '其他') : '其他';
            const description = descIdx >= 0 ? (cols[descIdx]?.trim() || '') : '';
            // 注意：当前 addTask 不支持直接设置 completed 状态，导入的任务默认为未完成
            // const completed = doneIdx >= 0 ? ... ;
            const recurrence = recurIdx >= 0 ? (cols[recurIdx]?.trim() || null) : null;
            const subtaskRaw = subIdx >= 0 ? (cols[subIdx]?.trim() || '') : '';

            // 解析子任务
            let subtasks: { title: string; completed: boolean }[] | undefined;
            if (subtaskRaw) {
              subtasks = subtaskRaw.split(';').map(s => {
                const m = s.trim().match(/^(.+?)\(([✓✗])\)$/);
                if (m) {
                  return { title: m[1].trim(), completed: m[2] === '✓' };
                }
                return { title: s.trim(), completed: false };
              });
            }

            // 匹配或创建分类
            let categoryId = 'other';
            const existingCat = categories.find(c => c.name === catName);
            if (existingCat) {
              categoryId = existingCat.id;
            } else if (catName !== '其他') {
              // 创建新分类
              addCategory(catName);
              categoryId = 'cat_' + catName.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '_');
            }

            addTask({
              title,
              time,
              categoryId,
              color: 'blue',
              description,
              recurrence: ['daily', 'weekly', 'monthly', 'yearly'].includes(recurrence || '') ? recurrence : null,
              recurrenceEndDate: undefined,
              subtasks,
            }, date);
            imported++;
          }

          alert(`导入成功！共导入 ${imported} 条任务。`);
        } catch {
          alert('文件解析失败，请确认文件为有效的 CSV 格式。建议下载模板参考。');
        }
      };
      reader.readAsText(file, 'UTF-8');
      // Reset input
      e.target.value = '';
    },
    [categories, addCategory, addTask]
  );

  const renderPage = () => {
    switch (activeTab) {
      case 'today':
        return (
          <TodayPage
            tasks={tasks}
            categories={categories}
            onAddTask={addTask}
            onUpdateTask={updateTask}
            onToggleTask={toggleTask}
            onToggleSubtask={toggleSubtask}
            onDeleteTask={(id, deleteChain) => {
              if (deleteChain) {
                deleteTaskChain(id);
              } else {
                deleteTask(id);
              }
            }}
            getCategoryColor={getCategoryColor}
            getCategoryName={getCategoryName}
          />
        );
      case 'calendar':
        return (
          <CalendarPage
            tasks={tasks}
            categories={categories}
            onAddTask={addTask}
            onToggleTask={toggleTask}
            onToggleSubtask={toggleSubtask}
          />
        );
      case 'stats':
        return (
          <StatsPage
            tasks={tasks}
            categoryStats={getCategoryStats}
            onToggleTask={toggleTask}
            onDeleteTask={(id, deleteChain) => {
              if (deleteChain) {
                deleteTaskChain(id);
              } else {
                deleteTask(id);
              }
            }}
            getCategoryColor={getCategoryColor}
            getCategoryName={getCategoryName}
          />
        );
      case 'assistant':
        return <AIChatPage />;
      case 'profile':
        return (
          <ProfilePage
            categories={categories}
            onAddCategory={addCategory}
            onUpdateCategory={updateCategory}
            onDeleteCategory={deleteCategory}
            onImport={handleImportClick}
            onExport={handleExport}
            onDownloadTemplate={handleDownloadTemplate}
            notifySettings={notifySettings}
            notifyPermission={notifyPermission}
            onUpdateNotifySetting={handleUpdateNotifySetting}
            onRequestNotifyPermission={requestNotifyPermission}
            onTestNotify={testNotify}
            syncStatus={syncStatus}
            onSyncNow={syncNow}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-screen bg-[var(--bg-primary)] flex justify-center p-0 md:p-4">
      <div className="app-container">
        <main className="flex-1 overflow-hidden flex flex-col relative">
          {renderPage()}
        </main>
        <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,text/csv"
        onChange={handleFileChange}
        className="hidden"
      />
      {/* Hidden anchor for download (React-managed, avoids DOM manipulation errors) */}
      <a ref={downloadRef} className="hidden" aria-hidden="true" />
    </div>
  );
}

export default App;
