// Layer 2: Mode Controller (v2)
// DETERMINISTIC layer — no LLM call. Pure rule-based mapping from intent to
// (mode, allow_execution). This is the safety gate that prevents accidental
// execution during chat.
//
// Key rule: allow_execution=false means NO database writes can happen,
// regardless of what downstream layers might try to do.

/**
 * Map intent to mode and execution permission
 * @param {string} intent - From Layer 1: chat | task_single | task_batch | project | query
 * @returns {{ mode: "chat"|"task"|"mixed", allow_execution: boolean }}
 */
function controlMode(intent) {
  switch (intent) {
    case 'chat':
      return {
        mode: 'chat',
        allow_execution: false
        // Chat is strictly conversational. No DB writes allowed.
      };

    case 'task_single':
    case 'task_batch':
    case 'project':
      return {
        mode: 'task',
        allow_execution: true
        // These are action-oriented intents. Execution is allowed
        // but still requires user confirmation for mutations.
      };

    case 'query':
      return {
        mode: 'mixed',
        allow_execution: true
        // Queries are read-only by nature. allow_execution=true
        // so the executor can run SELECT-type operations.
        // "mixed" mode means the system can explain results and
        // optionally offer to take action.
      };

    default:
      // Unknown intent — safest fallback
      console.warn(`[ModeController] Unknown intent "${intent}", defaulting to chat`);
      return {
        mode: 'chat',
        allow_execution: false
      };
  }
}

/**
 * Check if a specific operation type is a mutation (write/delete)
 * @param {string} operation - e.g. "batch_query", "batch_delete", "create_task"
 * @returns {boolean}
 */
function isMutation(operation) {
  const mutations = [
    'create_task', 'update_task', 'delete_task', 'add_subtask',
    'batch_delete', 'batch_complete', 'batch_update_date'
  ];
  return mutations.includes(operation);
}

module.exports = { controlMode, isMutation };
