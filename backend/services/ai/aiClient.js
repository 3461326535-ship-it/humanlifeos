// Shared DeepSeek API client — single source of truth for:
// - API key check
// - Connection config
// - Error handling
// - Token logging

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

/** Quick check: is the API key configured? */
function isConfigured() {
  return !!(DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your-deepseek-api-key');
}

/**
 * Call the DeepSeek chat-completion API.
 *
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {object} [opts]
 * @param {number} [opts.temperature=0.3]
 * @param {number} [opts.maxTokens=300]
 * @param {string|null} [opts.responseFormat] — set to 'json_object' for structured output
 * @param {string} [opts.label] — human label for log output (e.g. "Intent", "Planner")
 * @returns {Promise<string|null>} — the response text, or null on any failure
 */
async function callDeepSeek(systemPrompt, userMessage, opts = {}) {
  const { temperature = 0.3, maxTokens = 300, responseFormat = null, label = 'ai' } = opts;

  if (!isConfigured()) return null;

  try {
    const body = {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature,
      max_tokens: maxTokens,
      top_p: 0.9
    };

    if (responseFormat === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch (e) { /* ignore */ }
      console.error(`[aiClient] ${label} - API error ${res.status}: ${detail}`);
      if (res.status === 401) console.error('[aiClient] API key 无效，请检查 DEEPSEEK_API_KEY');
      if (res.status === 402) console.error('[aiClient] DeepSeek 余额不足，请充值或更换 API key');
      if (res.status === 429) console.error('[aiClient] DeepSeek 触发限流，请稍后重试');
      return null;
    }

    const data = await res.json();
    const content = data.choices[0].message.content.trim();
    const tokens = data.usage?.total_tokens || '?';
    console.log(`[aiClient] ${label} (${tokens}t):`, content.substring(0, 120));

    return content;
  } catch (err) {
    console.error(`[aiClient] ${label} — call failed:`, err.message);
    return null;
  }
}

module.exports = { callDeepSeek, isConfigured, DEEPSEEK_MODEL };
