import { motion } from 'framer-motion';
import type { CategoryStat } from '@/types';

interface CategoryCardProps {
  stat: CategoryStat;
  index: number;
}

export default function CategoryCard({ stat, index }: CategoryCardProps) {
  const { category, completedCount, totalCount } = stat;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      className="bg-white rounded-xl card-shadow p-4 flex-1 min-w-0"
    >
      <p className="text-[12px] font-medium truncate" style={{ color: category.color }}>
        {category.name}
      </p>
      <p className="text-[24px] font-bold text-[var(--text-primary)] mt-1">
        {totalCount > 0 ? `${percentage}%` : '-'}
      </p>
      <div className="w-full h-1.5 bg-[var(--bg-primary)] rounded-full mt-2 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: category.color }}
          initial={{ width: 0 }}
          animate={{ width: totalCount > 0 ? `${percentage}%` : '0%' }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: index * 0.1 }}
        />
      </div>
      <p className="text-[12px] text-[var(--text-tertiary)] mt-1.5">
        {completedCount}/{totalCount}
      </p>
    </motion.div>
  );
}
