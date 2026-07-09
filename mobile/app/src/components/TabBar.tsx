import { CalendarCheck, LayoutGrid, BarChart3, Sparkles, Settings } from 'lucide-react';
import type { TabId } from '@/types';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; icon: typeof CalendarCheck; label: string }[] = [
  { id: 'today', icon: CalendarCheck, label: '今天' },
  { id: 'calendar', icon: LayoutGrid, label: '视图' },
  { id: 'stats', icon: BarChart3, label: '统计' },
  { id: 'assistant', icon: Sparkles, label: 'AI助手' },
  { id: 'profile', icon: Settings, label: '我的' },
];

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="shrink-0 h-16 bg-white border-t border-[var(--divider)] z-50 flex items-center justify-around px-1">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-xl transition-all duration-200 select-none active:scale-95"
            style={{
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon
              size={22}
              strokeWidth={isActive ? 2.5 : 1.5}
              className={isActive ? 'text-[var(--primary-blue)]' : 'text-[var(--icon-gray)]'}
            />
            <span
              className={`text-[10px] font-medium ${
                isActive ? 'text-[var(--primary-blue)]' : 'text-[var(--text-tertiary)]'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
