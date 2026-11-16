import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * 写随手记的唯一入口：页头浮层、每日战报都走这里。
 *
 * 为什么要集中：这条记录有两个消费方（战报的 notes 列表 + 统计页的条数），
 * 还有两个写入点（任何页面的「记一句」、战报里的补记输入框）。
 * 谁写都得让所有日期的战报失效 —— 只失效当前日，切到别的日期会看到旧数据。
 */
export async function saveNote(queryClient: QueryClient, content: string, date?: string) {
  const row = await api.addNote(content, date);
  await queryClient.invalidateQueries({ queryKey: ['report'] });
  await queryClient.invalidateQueries({ queryKey: ['notes'] });
  return row;
}

export async function removeNote(queryClient: QueryClient, id: number) {
  await api.deleteNote(id);
  await queryClient.invalidateQueries({ queryKey: ['report'] });
  await queryClient.invalidateQueries({ queryKey: ['notes'] });
}
