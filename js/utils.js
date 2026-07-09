// js/utils.js — 公共工具函数（所有页面共享）

/**
 * HTML 转义（防 XSS）
 * 使用 DOM API 而非正则，覆盖所有 HTML 实体
 */
function escapeHtml(str) {
    if (!str && str !== 0) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

/**
 * Toast 通知（底部弹出）
 * @param {string} message - 消息内容
 * @param {string} type - 'success' | 'error' (默认 success)
 */
function showToast(message, type) {
    type = type || 'success';
    var toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.style.cssText =
            'position:fixed;bottom:24px;right:24px;padding:10px 18px;border-radius:8px;' +
            'font-size:13px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.2);' +
            'transition:opacity 0.3s;max-width:360px;word-break:break-word;color:#fff;';
        document.body.appendChild(toast);
    }
    toast.className = type === 'error' ? 'toast-error' : 'toast-success';
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
        toast.style.opacity = '0';
    }, 3000);
}
