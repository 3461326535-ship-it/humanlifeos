// Layer 3: Project Planner (v2.0.2)
// Breaks a user's project-level goal into 3-5 logical phases.
//
// CRITICAL CONSTRAINT: This layer outputs only phase-level descriptions.
// It MUST NOT generate specific task titles — that's the Task Decomposer's job.

const { callDeepSeek, isConfigured } = require('./aiClient');

function buildPlannerPrompt(message) {
  return `你是项目规划师。把用户的目标拆成 3-5 个逻辑阶段。

## ⚠️ 核心规则
1. 每个 phase 只描述阶段目标，**绝对不要写具体任务**（如"设计海报""写代码"这类是任务不是阶段）
2. phases 按执行顺序排列
3. 阶段名称简短（2-4 个字），目标描述一句话（10-20 字）
4. 如果用户输入过于模糊（如"做一个东西"），依然要给出合理的通用阶段规划
5. 如果用户输入是很小的目标（如"买个礼物"），也可以只拆分 2 个阶段

## 输出格式（严格 JSON）
{
  "title": "项目名称（简短提炼，5-15 字）",
  "phases": [
    {"name": "阶段名", "goal": "阶段目标描述", "order": 1},
    {"name": "阶段名", "goal": "阶段目标描述", "order": 2}
  ]
}

## 示例
用户: "做一个公司官网"
→ {"title":"公司官网建设","phases":[{"name":"需求与规划","goal":"确定网站结构、栏目和技术方案","order":1},{"name":"UI设计","goal":"完成视觉设计和原型确认","order":2},{"name":"前端开发","goal":"页面开发、响应式适配和动效","order":3},{"name":"后端开发","goal":"CMS搭建、API开发和数据对接","order":4},{"name":"测试上线","goal":"联调测试、性能优化和部署上线","order":5}]}

用户: "规划一次团建活动"
→ {"title":"团队建设活动","phases":[{"name":"策划","goal":"确定活动形式、预算和地点","order":1},{"name":"准备","goal":"物资采购、场地预订和通知","order":2},{"name":"执行","goal":"活动当天流程执行","order":3},{"name":"收尾","goal":"总结反馈和费用报销","order":4}]}

用户: "产品发布会"
→ {"title":"产品发布会","phases":[{"name":"筹备","goal":"确定发布策略、场地和嘉宾","order":1},{"name":"内容准备","goal":"演讲稿、演示文稿和宣传物料","order":2},{"name":"预热推广","goal":"媒体预热和用户期待营造","order":3},{"name":"活动执行","goal":"现场流程、直播和技术保障","order":4},{"name":"后续跟进","goal":"媒体报道追踪和用户转化","order":5}]}

只返回 JSON，不要任何额外文字。`;
}

/**
 * Plan a project: goal → phases
 * @param {string} message - User's project description
 * @returns {Promise<object|null>} - { title, phases: [{name, goal, order}] } or null on failure
 */
async function planProject(message) {
  if (!isConfigured()) return null;

  const raw = await callDeepSeek(buildPlannerPrompt(message), message, {
    temperature: 0.3, maxTokens: 600, responseFormat: 'json_object', label: 'Planner'
  });

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    // Validate required fields
    if (!parsed.title || !parsed.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
      console.error('[ProjectPlanner] Invalid response structure');
      return null;
    }

    // Ensure each phase has required fields
    const validPhases = parsed.phases.filter(p => p.name && p.goal);
    if (validPhases.length === 0) {
      console.error('[ProjectPlanner] No valid phases found');
      return null;
    }

    return {
      title: parsed.title,
      phases: validPhases.map((p, i) => ({
        name: p.name,
        goal: p.goal,
        order: p.order || (i + 1)
      }))
    };
  } catch (err) {
    console.error('[ProjectPlanner] Failed:', err.message);
    return null;
  }
}

module.exports = { planProject, buildPlannerPrompt };
