// Layer 4: Task Decomposer (v2.0.2)
// Breaks project phases into concrete, executable tasks with suggested dates.
//
// Input: { title, phases[{name, goal, order}] } from Project Planner
// Output: { phases[{name, tasks[{title, suggestedDaysFromNow, category}]}] }

const { getToday } = require('./aiDateHelper');
const { callDeepSeek, isConfigured } = require('./aiClient');

function buildDecomposerPrompt(plan) {
  const today = getToday();
  const phasesJson = JSON.stringify(plan.phases.map(p => ({ name: p.name, goal: p.goal })));

  return `你是任务拆解师。为每个项目阶段生成 2-5 个具体可执行的任务。

## ⚠️ 核心规则
1. 每个任务标题清晰具体，是可直接执行的行动（动词开头，如"撰写""设计""联系""搭建"）
2. suggestedDaysFromNow: 从今天（${today}）起第几天开始做。0=今天。同一阶段的任务紧凑安排，不同阶段之间留出合理间隔
3. category: 根据任务性质选择 工作 / 生活 / 其他
4. 任务按执行的先后顺序排列
5. 不要把不同阶段的任务混在一起

## 项目信息
- 项目名称: ${plan.title}
- 阶段列表: ${phasesJson}

## 输出格式（严格 JSON）
{
  "phases": [
    {
      "name": "阶段名（与输入一致）",
      "tasks": [
        {"title": "具体任务标题", "suggestedDaysFromNow": 0, "category": "其他"},
        {"title": "具体任务标题", "suggestedDaysFromNow": 2, "category": "生活"}
      ]
    }
  ]
}

## 示例
项目: "公司官网建设", 阶段: [{"name":"设计","goal":"UI视觉设计"}]
→ {"phases":[{"name":"设计","tasks":[{"title":"确定品牌色和设计规范","suggestedDaysFromNow":0,"category":"其他"},{"title":"设计首页布局线框图","suggestedDaysFromNow":1,"category":"其他"},{"title":"设计内页模板","suggestedDaysFromNow":3,"category":"其他"},{"title":"设计移动端适配方案","suggestedDaysFromNow":5,"category":"其他"}]}]}

只返回 JSON，不要任何额外文字。`;
}

/**
 * Decompose project phases into executable tasks
 * @param {object} plan - { title, phases[{name, goal, order}] } from Project Planner
 * @returns {Promise<object|null>} - { phases[{name, tasks[{title, suggestedDaysFromNow, category}]}] } or null
 */
async function decomposeTasks(plan) {
  if (!isConfigured()) return null;

  const raw = await callDeepSeek(buildDecomposerPrompt(plan),
    `请为项目「${plan.title}」的每个阶段拆解具体任务。`, {
    temperature: 0.3, maxTokens: 1200, responseFormat: 'json_object', label: 'Decomposer'
  });

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    // Validate
    if (!parsed.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
      console.error('[TaskDecomposer] Invalid response structure');
      return null;
    }

    // Validate each phase has tasks
    const validPhases = parsed.phases.filter(p => p.tasks && Array.isArray(p.tasks) && p.tasks.length > 0);
    if (validPhases.length === 0) {
      console.error('[TaskDecomposer] No valid phases with tasks');
      return null;
    }

    return {
      phases: validPhases.map(p => ({
        name: p.name,
        tasks: p.tasks.map(t => ({
          title: t.title,
          suggestedDaysFromNow: typeof t.suggestedDaysFromNow === 'number' ? t.suggestedDaysFromNow : 0,
          category: t.category || '其他'
        }))
      }))
    };
  } catch (err) {
    console.error('[TaskDecomposer] Failed:', err.message);
    return null;
  }
}

module.exports = { decomposeTasks, buildDecomposerPrompt };
