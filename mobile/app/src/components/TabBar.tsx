import { SketchIcon } from '@/components/icons/SketchIcon';
import type { TabId } from '@/types';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; icon: string; label: string }[] = [
  { id: 'today', icon: 'sun', label: '今天' },
  { id: 'calendar', icon: 'calendar', label: '视图' },
  { id: 'stats', icon: 'chart', label: '统计' },
  { id: 'assistant', icon: 'sparkle', label: 'AI' },
  { id: 'profile', icon: 'user', label: '我的' },
];

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="sketch-tabbar shrink-0 z-50">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex flex-col items-center gap-[3px] select-none active:scale-95 transition-transform"
            style={{
              color: isActive ? 'var(--red)' : 'var(--ink-soft)',
              fontWeight: isActive ? 700 : 400,
              fontFamily: "'Caveat', cursive",
              fontSize: 13,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span className="flex text-[20px]">
              <SketchIcon name={tab.icon} size={21} strokeWidth={2.2} />
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
