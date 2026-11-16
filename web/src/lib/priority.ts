// 优先级小方牌的唯一出处（今天列表 / 看板卡共用），避免两处样式各写一份再走偏。
//
// 两个状态：
//   未完成 —— 浅底 + 描边，有颜色，是「现在该看哪个」的信号
//   已完成 —— 同一块牌子，但抽掉底色、压低对比
//
// 为什么已完成的也要留着：优先级说的是「这件事的分量」，不是「待办」这个状态。
// 做完之后它变成一条历史信息（这一周的重活干了几件、哪些是硬骨头顺手收的），
// 直接抹掉等于把回顾时唯一的线索删了。压暗是为了不让它跟左边的对勾抢注意力。
const PRIORITY_CHIP: Record<string, string> = {
  high: 'border-coral/40 bg-coral-soft/70 text-coral',
  medium: 'border-clay/40 bg-clay-soft/70 text-clay',
  low: 'border-line bg-paper-deep text-ink-soft',
};

const PRIORITY_CHIP_DONE: Record<string, string> = {
  high: 'border-coral/25 text-coral/65',
  medium: 'border-clay/25 text-clay/65',
  low: 'border-line/70 text-ink-faint',
};

export const PRIORITY_TEXT: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export function priorityChipClass(priority: string | null | undefined, done = false) {
  if (!priority) return '';
  const map = done ? PRIORITY_CHIP_DONE : PRIORITY_CHIP;
  return map[priority] ?? (done ? PRIORITY_CHIP_DONE.low : PRIORITY_CHIP.low);
}
