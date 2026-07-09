import { useState } from 'react';
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react';
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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 z-[60]"
          />
          {/* Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-[var(--bg-primary)] rounded-t-2xl z-[70] max-h-[70%] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--divider)]">
              <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">分类管理</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center active:scale-95 transition-transform"
              >
                <X size={18} className="text-[var(--text-secondary)]" />
              </button>
            </div>

            {/* Add new */}
            <div className="px-4 py-3 flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="输入新分类名称"
                className="flex-1 h-10 px-3 rounded-lg bg-white border border-[var(--divider)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--primary-blue)] transition-colors"
              />
              <button
                onClick={handleAdd}
                disabled={!newName.trim()}
                className="h-10 px-4 rounded-lg bg-[var(--primary-blue)] text-white text-[14px] font-medium flex items-center gap-1 disabled:opacity-40 active:scale-95 transition-all"
              >
                <Plus size={16} />
                添加
              </button>
            </div>

            {/* Category list */}
            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <div className="bg-white rounded-xl overflow-hidden">
                {categories.map((cat, idx) => (
                  <div
                    key={cat.id}
                    className={`flex items-center px-4 py-3.5 ${
                      idx < categories.length - 1 ? 'border-b border-[var(--divider)]' : ''
                    }`}
                  >
                    {/* Color dot */}
                    <div
                      className="w-3 h-3 rounded-full mr-3 shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />

                    {/* Name */}
                    {editingId === cat.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdate(cat.id)}
                          autoFocus
                          className="flex-1 h-8 px-2 rounded bg-[var(--bg-primary)] border border-[var(--divider)] text-[15px] outline-none focus:border-[var(--primary-blue)]"
                        />
                        <button
                          onClick={() => handleUpdate(cat.id)}
                          className="w-7 h-7 rounded-full bg-[var(--green)] flex items-center justify-center active:scale-90 transition-transform"
                        >
                          <Check size={14} className="text-white" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-[15px] text-[var(--text-primary)]">
                          {cat.name}
                        </span>
                        {!defaultCategoryIds.includes(cat.id) && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingId(cat.id);
                                setEditName(cat.name);
                              }}
                              className="w-8 h-8 rounded-full flex items-center justify-center active:bg-gray-100 transition-colors"
                            >
                              <Pencil size={15} className="text-[var(--text-tertiary)]" />
                            </button>
                            {deleteConfirm === cat.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    onDelete(cat.id);
                                    setDeleteConfirm(null);
                                  }}
                                  className="px-2 h-7 rounded bg-[var(--red)] text-white text-[12px] font-medium active:scale-95 transition-transform"
                                >
                                  确认
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="px-2 h-7 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] text-[12px] active:scale-95 transition-transform"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(cat.id)}
                                className="w-8 h-8 rounded-full flex items-center justify-center active:bg-gray-100 transition-colors"
                              >
                                <Trash2 size={15} className="text-[var(--red)]" />
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
                <p className="text-center text-[var(--text-tertiary)] text-[14px] py-8">
                  暂无分类，请添加
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
