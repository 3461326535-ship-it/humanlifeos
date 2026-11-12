import { useState } from 'react';
import { SketchIcon } from '@/components/icons/SketchIcon';
import { motion, AnimatePresence } from 'framer-motion';
import type { Category } from '@/types';

interface CategoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onAdd: (name: string) => void;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function CategoryManager({
  isOpen,
  onClose,
  categories,
  onAdd,
  onUpdate,
  onDelete,
}: CategoryManagerProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleAdd = () => {
    if (newName.trim()) {
      onAdd(newName.trim());
      setNewName('');
    }
  };

  const handleUpdate = (id: string) => {
    if (editName.trim()) {
      onUpdate(id, editName.trim());
      setEditingId(null);
    }
  };

  const defaultCategoryIds = ['work', 'life', 'other'];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 z-[60]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-[var(--bg-card)] rounded-t-2xl z-[70] max-h-[70%] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-dashed border-[var(--ink-soft)]">
              <h2 className="font-head text-[17px] text-[var(--ink)]">分类管理</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[var(--fill-quaternary)] flex items-center justify-center active:scale-95 transition-transform"
              >
                <SketchIcon name="x" size={18} strokeWidth={2.5} className="text-[var(--ink-soft)]" />
              </button>
            </div>

            <div className="px-4 py-3 flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="输入新分类名称"
                className="sketch-input flex-1 h-10 px-3 text-[15px] text-[var(--ink)] placeholder:text-[var(--text-tertiary)] outline-none"
              />
              <button
                onClick={handleAdd}
                disabled={!newName.trim()}
                className="h-10 px-4 rounded-xl bg-[var(--red)] text-white text-[14px] font-head font-medium flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all border-2 border-[var(--ink)] sketch-wobble-sm"
              >
                <SketchIcon name="plus" size={16} strokeWidth={2.5} stroke="white" />
                添加
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <div className="flex flex-col gap-[11px]">
                {categories.map((cat) => (
                  <div key={cat.id} className="sketch-card p-[13px_14px] flex items-center">
                    <div className="w-3 h-3 rounded-full mr-3 shrink-0" style={{ backgroundColor: cat.color }} />

                    {editingId === cat.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdate(cat.id)}
                          autoFocus
                          className="sketch-input flex-1 h-8 px-2 text-[15px] outline-none"
                        />
                        <button
                          onClick={() => handleUpdate(cat.id)}
                          className="w-7 h-7 rounded-full bg-[var(--green)] flex items-center justify-center active:scale-90 transition-transform border-2 border-[var(--ink)] sketch-wobble-sm"
                        >
                          <SketchIcon name="check" size={14} strokeWidth={3} stroke="white" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 font-head text-[15px] text-[var(--ink)]">{cat.name}</span>
                        {!defaultCategoryIds.includes(cat.id) && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
                              className="w-8 h-8 rounded-full flex items-center justify-center active:bg-[var(--fill-quaternary)] transition-colors"
                            >
                              <SketchIcon name="pen" size={15} strokeWidth={2} className="text-[var(--ink-soft)]" />
                            </button>
                            {deleteConfirm === cat.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => { onDelete(cat.id); setDeleteConfirm(null); }}
                                  className="px-2 h-7 rounded bg-[var(--red)] text-white text-[12px] font-head font-medium active:scale-95 transition-transform border-2 border-[var(--ink)]"
                                >
                                  确认
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="px-2 h-7 rounded bg-[var(--fill-quaternary)] text-[var(--ink-soft)] text-[12px] font-head active:scale-95 transition-transform"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(cat.id)}
                                className="w-8 h-8 rounded-full flex items-center justify-center active:bg-[var(--fill-quaternary)] transition-colors"
                              >
                                <SketchIcon name="trash" size={15} strokeWidth={2} className="text-[var(--red)]" />
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              {categories.length === 0 && (
                <p className="text-center text-[var(--ink-soft)] font-head text-[14px] py-8">暂无分类，请添加</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
