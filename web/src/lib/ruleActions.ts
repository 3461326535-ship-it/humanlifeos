import { api } from './api';
import { doneStamp } from './spans';
import type { RuleChange } from './types';

/**
 * 周期任务的两层语义，只有这一份实现。
 *
 * 「动这一期」和「动整条规则」是最容易说混的一件事：行内勾选、回顾页按钮、
 * 看板右键菜单、详情面板，四个入口如果各写各的，迟早会出现
 * 「行内点完成是补记这一期，右键点完成却把整条规则停了」这种漂移。
 * 所以入口可以多，调用只能走这里。
 *
 * 这一组：只作用于**这一期**，规则照旧往下走。
 */
export const occurrence = {
  /** 完成这一期；doneOn 是「实际做完的那天」（补记旧账用），不传就是现在 */
  complete(eventId: number, doneOn?: string) {
    return doneOn
      ? api.completeOn(eventId, doneStamp(doneOn))
      : api.updateStatus(eventId, 'done');
  },
  /** 跳过这一期：这次不做，下次照常（可恢复） */
  skip(eventId: number) {
    return api.cancelEvent(eventId, true);
  },
  /** 撤销跳过：放回待办 */
  restore(eventId: number) {
    return api.cancelEvent(eventId, false);
  },
  /** 把这一期挪到某天（不动节奏） */
  moveTo(eventId: number, day: string) {
    return api.updateEvent(eventId, { date: day });
  },
};

/**
 * 这一组：作用于**整条规则**。两个动作都不可逆地影响未来排期，
 * 所以界面上必须和上面的「这一期」分开摆（珊瑚色、带确认）。
 */
export const rule = {
  /** 停掉：明天起不再生成，未来没做的实例一起收走 */
  stop(ruleId: number) {
    return api.stopRecurringRule(ruleId);
  },
  /** 改规则前先看影响（会收走几期、下一期哪天），只算不写 */
  preview(ruleId: number, patch: RuleChange) {
    return api.previewRecurringChange(ruleId, patch);
  },
  /** 改规则：按新节奏重排未来，今天及以前和已完成的不动 */
  change(ruleId: number, patch: RuleChange) {
    return api.changeRecurringRule(ruleId, patch);
  },
};
