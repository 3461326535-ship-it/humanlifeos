/* =========================================================
 * 在线 Markdown 编辑器 - 复刻实现
 * 左侧编辑 / 右侧实时预览，本地自动保存
 * ========================================================= */
(function () {
  'use strict';

  // ===== DOM =====
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const lineNumbers = document.getElementById('line-numbers');
  const resizer = document.getElementById('resizer');
  const editorPane = document.querySelector('.editor-pane');
  const previewPane = document.querySelector('.preview-pane');
  const saveStatus = document.getElementById('save-status');
  const wordCountEl = document.getElementById('word-count');
  const cursorPos = document.getElementById('cursor-pos');
  const syncScrollCheck = document.getElementById('sync-scroll-check');
  const tooltipEl = document.getElementById('tooltip');
  const sidebar = document.getElementById('file-sidebar');
  const fileListEl = document.getElementById('file-list');
  const importFile = document.getElementById('import-file');

  // ===== 存储键 =====
  const THEME_KEY = 'md_editor_theme';
  const SYNC_SCROLL_KEY = 'md_editor_sync_scroll';
  const LINE_NUMBERS_KEY = 'md_editor_line_numbers';
  const FILES_KEY = 'md_editor_files';
  const CURRENT_FILE_KEY = 'md_editor_current_file';

  let isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  let syncScroll = localStorage.getItem(SYNC_SCROLL_KEY) !== 'off';
  let mermaidLoaded = false;
  let mermaidLoading = false;

  // ===== 默认文档 =====
  const DEFAULT_CONTENT = `# 欢迎使用 Markdown 编辑器

这是一个 **完全在浏览器本地** 运行的 Markdown 编辑器：左侧编辑、右侧实时预览，草稿自动保存到 localStorage。

## 功能特性

- 📝 **实时预览** — 左侧编辑，右侧即时渲染
- 🌙 **深色模式** — 一键切换主题
- 💾 **自动保存** — 内容保存在浏览器本地
- 🎨 **代码高亮** — 支持多种编程语言
- 📊 **Mermaid 图表** — 流程图、时序图等
- 🧮 **数学公式** — 支持 KaTeX 渲染
- 📋 **目录生成** — 使用 [TOC] 插入目录

## 目录

[TOC]

## 语法示例

### 文本样式

**粗体**、*斜体*、~~删除线~~、==高亮==、\`行内代码\`

### 标题

不同数量的\`#\`可以完成不同的标题，如下：

\`\`\`
# 一级标题

## 二级标题

### 三级标题
\`\`\`

### 链接

对于该论述，欢迎读者查阅之前发过的文章，[你是《未来世界的幸存者》么？](https://mp.weixin.qq.com/s/s5IhxV2ooX3JN_X416nidA)
<a id="jump_8"></a>
### 图片

插入图片，格式如下：

![这里写图片描述](https://markdown.com.cn/images/qrcode_for_gh_82cf87d482f0_258.jpg)



### 无序列表

无序列表的使用，在符号\`-\`后加空格使用。如下：

- 无序列表 1
- 无序列表 2
- 无序列表 3

如果要控制列表的层级，则需要在符号\`-\`前使用空格。如下：

- 无序列表 1
- 无序列表 2
  - 无序列表 2.1
  - 无序列表 2.2


### 有序列表

有序列表的使用，在数字及符号\`.\`后加空格后输入内容，如下：

1. 有序列表 1
2. 有序列表 2
3. 有序列表 3

### 代码块

\`\`\`javascript
function hello() {
  console.log('Hello, Markdown!');
}
\`\`\`

### 任务列表

- [x] 已完成的项目
- [ ] 待办事项
- [ ] 另一个任务

### 表格

| 功能 | 状态 | 说明 |
|------|------|------|
| 实时预览 | ✅ | 左侧编辑右侧渲染 |
| 自动保存 | ✅ | localStorage 存储 |
| 导出文件 | ✅ | 支持 Markdown / HTML |

### 引用

> "Markdown 是一种轻量级标记语言，让你专注于写作本身。"

### 脚注

这里有一个脚注引用[^1]。

[^1]: 这是脚注的内容。

### 数学公式

行内公式：$E = mc^2$

块级公式：

$$
\\int_{a}^{b} f(x) \\, dx = F(b) - F(a)
$$

### Mermaid 图表

\`\`\`mermaid
graph TD
    A[开始] --> B{判断}
    B -->|条件1| C[处理1]
    B -->|条件2| D[处理2]
    C --> E[结束]
    D --> E
\`\`\`

### Callout

> [!INFO]
> 这是一个信息提示框。

> [!WARNING]
> 这是一个警告提示框。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+B | 粗体 |
| Ctrl+I | 斜体 |
| Ctrl+K | 链接 |
| Ctrl+S | 手动保存 |
| Ctrl+/ | 注释 |

---

**开始你的写作之旅吧！** ✨
`;

  // ===== 工具函数 =====
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slugify(text) {
    return String(text).trim().toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\w一-龥\- ]/g, '')
      .replace(/\s+/g, '-') || 'section';
  }

  // ===== Marked 配置 =====
  function setupMarked() {
    const renderer = new marked.Renderer();

    // 标题带锚点 id
    renderer.heading = function (text, level, raw) {
      const id = slugify(raw || text);
      return `<h${level} id="${id}">${text}</h${level}>\n`;
    };

    // Callout: > [!INFO] / [!WARNING] / [!DANGER] / [!SUCCESS]
    const CALLOUT_ICONS = { info: 'ℹ️', warning: '⚠️', danger: '⛔', success: '✅' };
    renderer.blockquote = function (quote) {
      const m = quote.match(/^\s*<p>\[!([A-Z]+)\](?:\s+([^<]*?))?(?:<br\s*\/?>\s*|\s*)/i);
      if (m) {
        const type = m[1].toLowerCase();
        const title = m[2] || type.toUpperCase();
        const icon = CALLOUT_ICONS[type] || 'ℹ️';
        const content = quote.replace(/^\s*<p>\[![A-Z]+\](?:\s+[^<]*?)?(?:<br\s*\/?>\s*|\s*)/i, '<p>');
        return `<div class="callout callout-${type}"><div class="callout-title">${icon} ${escapeHtml(title)}</div>${content}</div>`;
      }
      return `<blockquote>${quote}</blockquote>`;
    };

    // 代码块：高亮 + 复制按钮
    renderer.code = function (code, lang) {
      const language = (lang || '').trim().split(/\s+/)[0];
      if (language === 'mermaid') {
        return `<div class="mermaid">${escapeHtml(code)}</div>`;
      }
      let highlighted;
      try {
        if (language && window.hljs && hljs.getLanguage(language)) {
          highlighted = hljs.highlight(code, { language }).value;
        } else if (window.hljs) {
          highlighted = hljs.highlightAuto(code).value;
        } else {
          highlighted = escapeHtml(code);
        }
      } catch (e) {
        highlighted = escapeHtml(code);
      }
      const cls = language ? ` class="hljs language-${language}"` : ' class="hljs"';
      return `<pre><button class="hljs-copy-btn" type="button">复制</button><code${cls}>${highlighted}</code></pre>`;
    };

    // 任务列表样式
    renderer.listitem = function (text) {
      if (/^\s*<input[^>]*type="checkbox"/.test(text)) {
        return `<li class="task-list-item">${text}</li>`;
      }
      return `<li>${text}</li>`;
    };

    marked.use({
      renderer,
      gfm: true,
      breaks: false,
      extensions: [{
        name: 'markHighlight',
        level: 'inline',
        start(src) { return src.indexOf('=='); },
        tokenizer(src) {
          const m = /^==([^=]+)==/.exec(src);
          if (m) return { type: 'markHighlight', raw: m[0], text: m[1] };
        },
        renderer(token) {
          return `<mark>${escapeHtml(token.text)}</mark>`;
        }
      }]
    });
  }

  // ===== 脚注处理 =====
  function extractFootnotes(raw) {
    const defs = {};
    const cleaned = raw.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, function (_, key, def) {
      defs[key.trim()] = def.trim();
      return '';
    });
    return { cleaned, defs };
  }

  function applyFootnotes(html, defs) {
    const keys = Object.keys(defs);
    if (!keys.length) return html;
    const indexMap = {};
    keys.forEach((k, i) => { indexMap[k] = i + 1; });
    keys.forEach((key) => {
      const re = new RegExp('\\[\\^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]', 'g');
      html = html.replace(re,
        `<sup class="footnote-ref"><a id="fnref-${key}" href="#fn-${key}" title="查看脚注">[${indexMap[key]}]</a></sup>`);
    });
    let footnoteHtml = '';
    keys.forEach((key) => {
      footnoteHtml += `<li id="fn-${key}"><p>${marked.parseInline(defs[key])} <a href="#fnref-${key}" title="返回引用">↩</a></p></li>`;
    });
    html += `<div class="footnotes"><ol>${footnoteHtml}</ol></div>`;
    return html;
  }

  // ===== 目录 [TOC] =====
  function processTOC(html, raw) {
    if (!/\[TOC\]|\[toc\]/i.test(raw)) return html;
    const headings = [];
    const re = /<h([1-6]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
    let m;
    while ((m = re.exec(html))) {
      headings.push({ level: +m[1], id: m[2], text: m[3].replace(/<[^>]+>/g, '') });
    }
    if (!headings.length) {
      return html.replace(/<p>\[TOC\]<\/p>/gi, '').replace(/<p>\[toc\]<\/p>/gi, '');
    }
    let tocHtml = '<div class="toc"><div class="callout-title">📑 目录</div><ul>';
    headings.forEach((h) => {
      tocHtml += `<li style="margin-left:${(h.level - 2) * 16}px"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`;
    });
    tocHtml += '</ul></div>';
    return html.replace(/<p>\[TOC\]<\/p>/gi, tocHtml).replace(/<p>\[toc\]<\/p>/gi, tocHtml);
  }

  // ===== 渲染预览 =====
  function renderPreview() {
    if (!window.marked) return;
    const raw = editor.value;
    const { cleaned, defs } = extractFootnotes(raw);
    let html = marked.parse(cleaned);
    html = processTOC(html, cleaned);
    html = applyFootnotes(html, defs);
    if (window.DOMPurify) {
      html = DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'], ADD_ATTR: ['target', 'id'] });
    }
    preview.innerHTML = html;

    // 数学公式
    if (window.renderMathInElement) {
      try {
        renderMathInElement(preview, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      } catch (e) { /* ignore */ }
    }

    // Mermaid
    if (preview.querySelector('.mermaid')) {
      loadMermaid();
    }
    updateWordCount();
  }

  // ===== Mermaid 按需加载 =====
  function loadMermaid() {
    if (window.mermaid) { renderMermaid(); return; }
    if (mermaidLoading) return;
    mermaidLoading = true;
    const s = document.createElement('script');
    s.src = 'https://fastly.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
    s.onload = function () {
      mermaidLoaded = true;
      mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
      renderMermaid();
    };
    document.head.appendChild(s);
  }

  function renderMermaid() {
    if (!window.mermaid) return;
    const nodes = preview.querySelectorAll('.mermaid:not([data-processed])');
    if (!nodes.length) return;
    try {
      mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
      mermaid.run({ nodes }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  // ===== 保存 =====
  let saveTimer = null;
  function scheduleSave() {
    saveStatus.textContent = '保存中...';
    saveStatus.classList.add('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  function saveNow() {
    saveFiles();
    saveStatus.textContent = '已保存';
    saveStatus.classList.remove('saving');
  }

  // ===== 行号 =====
  function updateLineNumbers() {
    if (!lineNumbers.classList.contains('show')) return;
    const count = editor.value.split('\n').length;
    let nums = '';
    for (let i = 1; i <= count; i++) nums += i + '\n';
    lineNumbers.textContent = nums;
    syncLineNumbersScroll();
  }

  function syncLineNumbersScroll() {
    lineNumbers.scrollTop = editor.scrollTop;
    lineNumbers.style.transform = `translateY(${-editor.scrollTop}px)`;
  }

  function toggleLineNumbers() {
    const show = !lineNumbers.classList.contains('show');
    lineNumbers.classList.toggle('show', show);
    document.getElementById('line-numbers-toggle').classList.toggle('active', show);
    localStorage.setItem(LINE_NUMBERS_KEY, show ? 'on' : 'off');
    if (show) updateLineNumbers();
  }

  // ===== 字数统计 =====
  function updateWordCount() {
    const count = editor.value.replace(/\s/g, '').length;
    wordCountEl.textContent = `${count} 字`;
  }

  // ===== 光标位置 =====
  function updateCursorPos() {
    const pos = editor.selectionStart;
    const text = editor.value.substring(0, pos);
    const lines = text.split('\n');
    cursorPos.textContent = `行 ${lines.length}, 列 ${lines[lines.length - 1].length + 1}`;
  }

  // ===== 工具栏插入 =====
  const actions = {
    bold: { before: '**', after: '**', placeholder: '粗体文本' },
    italic: { before: '*', after: '*', placeholder: '斜体文本' },
    underline: { before: '<u>', after: '</u>', placeholder: '下划线文本' },
    strikethrough: { before: '~~', after: '~~', placeholder: '删除线文本' },
    code: { before: '```\n', after: '\n```', placeholder: '代码' },
    quote: { before: '> ', after: '', placeholder: '引用内容' },
    link: { before: '[', after: '](https://example.com)', placeholder: '链接文本' },
    image: { before: '![', after: '](https://example.com/image.png)', placeholder: '图片描述' },
    hr: { before: '\n---\n', after: '', placeholder: '' },
    toc: { before: '\n[TOC]\n', after: '', placeholder: '' },
    table: {
      before: '\n| 列1 | 列2 | 列3 |\n|------|------|------|\n| 内容 | 内容 | 内容 |\n',
      after: '', placeholder: ''
    },
    list: { before: '- ', after: '', placeholder: '列表项' },
    'ordered-list': { before: '1. ', after: '', placeholder: '列表项' },
    'task-list': { before: '- [ ] ', after: '', placeholder: '任务' },
    'heading-1': { before: '# ', after: '', placeholder: '标题' },
    'heading-2': { before: '## ', after: '', placeholder: '标题' },
    'heading-3': { before: '### ', after: '', placeholder: '标题' },
    'heading-4': { before: '#### ', after: '', placeholder: '标题' },
    'heading-5': { before: '##### ', after: '', placeholder: '标题' },
    'heading-6': { before: '###### ', after: '', placeholder: '标题' },
    sup: { before: '<sup>', after: '</sup>', placeholder: '上标' },
    sub: { before: '<sub>', after: '</sub>', placeholder: '下标' }
  };

  function insertMarkdown(action) {
    const cfg = actions[action];
    if (!cfg) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = editor.value.substring(start, end);
    const insertText = selected || cfg.placeholder;
    editor.setRangeText(cfg.before + insertText + cfg.after, start, end, 'end');
    editor.focus();
    if (!selected && cfg.placeholder) {
      const newPos = start + cfg.before.length;
      editor.setSelectionRange(newPos, newPos + cfg.placeholder.length);
    }
    onContentChange();
  }

  // ===== 主题切换 =====
  function toggleTheme() {
    isDark = !isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    const hljsTheme = document.getElementById('hljs-theme');
    if (hljsTheme) {
      hljsTheme.href = isDark
        ? 'https://fastly.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/styles/github-dark.min.css'
        : 'https://cdn.bootcdn.net/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    }
    if (mermaidLoaded) renderPreview();
  }

  // ===== 仅预览 =====
  function togglePreviewOnly() {
    const on = document.body.classList.toggle('preview-only');
    document.getElementById('preview-toggle').classList.toggle('active', on);
  }

  // ===== 下载 =====
  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function currentTitle() {
    const file = getFiles().find(f => f.id === getCurrentFileId());
    return (file && file.name) || 'document';
  }

  function downloadMd() {
    downloadFile(editor.value, `${currentTitle()}.md`, 'text/markdown');
  }

  function downloadHtml() {
    const body = preview.innerHTML;
    const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(currentTitle())}</title>
<style>
body { max-width: 800px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #2c2c2c; }
h1 { font-size: 2em; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; }
h2 { font-size: 1.6em; border-bottom: 1px solid #e0e0e0; padding-bottom: 6px; }
code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-family: Consolas, monospace; font-size: 0.88em; }
pre { background: #f6f8fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; overflow-x: auto; }
pre code { background: transparent; padding: 0; }
blockquote { border-left: 4px solid #2563eb; background: #f0f0f0; padding: 12px 16px; margin: 16px 0; color: #666; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; }
th, td { padding: 10px 14px; border: 1px solid #e0e0e0; text-align: left; }
th { background: #f0f0f0; }
img { max-width: 100%; }
mark { background: #fef08a; color: #854d0e; padding: 1px 4px; border-radius: 3px; }
pre .hljs-copy-btn { display: none; }
</style>
</head>
<body>${body}</body>
</html>`;
    downloadFile(doc, `${currentTitle()}.html`, 'text/html');
  }

  // ===== 文件管理 =====
  function getFiles() {
    try {
      return JSON.parse(localStorage.getItem(FILES_KEY)) || [];
    } catch (e) { return []; }
  }

  function getCurrentFileId() {
    return localStorage.getItem(CURRENT_FILE_KEY);
  }

  function saveFiles() {
    const files = getFiles();
    const id = getCurrentFileId();
    const file = files.find(f => f.id === id);
    if (file) {
      file.content = editor.value;
      const firstHeading = editor.value.match(/^#\s+(.+)$/m);
      if (firstHeading && file.autoName !== false) file.name = firstHeading[1].trim();
      file.updatedAt = Date.now();
      localStorage.setItem(FILES_KEY, JSON.stringify(files));
      renderFileList();
    }
  }

  function initFiles() {
    let files = getFiles();
    if (!files.length) {
      const saved = localStorage.getItem('md_editor_content');
      files = [{
        id: 'file-' + Date.now(),
        name: '欢迎使用 Markdown 编辑器',
        content: saved || DEFAULT_CONTENT,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }];
      localStorage.setItem(FILES_KEY, JSON.stringify(files));
      localStorage.setItem(CURRENT_FILE_KEY, files[0].id);
      localStorage.removeItem('md_editor_content');
    }
    if (!getFiles().find(f => f.id === getCurrentFileId())) {
      localStorage.setItem(CURRENT_FILE_KEY, files[0].id);
    }
  }

  function renderFileList() {
    const files = getFiles();
    const currentId = getCurrentFileId();
    fileListEl.innerHTML = '';
    files.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'file-item' + (file.id === currentId ? ' active' : '');
      item.innerHTML = `
        <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        <span class="file-actions">
          <button type="button" data-file-rename="${file.id}" title="重命名">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
          </button>
          <button type="button" data-file-delete="${file.id}" title="删除">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </span>`;
      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-file-rename]') || e.target.closest('[data-file-delete]')) return;
        switchFile(file.id);
      });
      fileListEl.appendChild(item);
    });
  }

  function switchFile(id) {
    saveFiles();
    localStorage.setItem(CURRENT_FILE_KEY, id);
    const file = getFiles().find(f => f.id === id);
    editor.value = file ? file.content : DEFAULT_CONTENT;
    editor.setSelectionRange(editor.value.length, editor.value.length);
    onContentChange();
    updateCursorPos();
    saveNow();
  }

  function createFile() {
    saveFiles();
    const files = getFiles();
    const file = {
      id: 'file-' + Date.now(),
      name: '未命名文档',
      content: '',
      autoName: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    files.push(file);
    localStorage.setItem(FILES_KEY, JSON.stringify(files));
    switchFile(file.id);
  }

  function renameFile(id) {
    const files = getFiles();
    const file = files.find(f => f.id === id);
    if (!file) return;
    const name = prompt('重命名文件', file.name);
    if (name && name.trim()) {
      file.name = name.trim();
      file.autoName = false;
      localStorage.setItem(FILES_KEY, JSON.stringify(files));
      renderFileList();
    }
  }

  function deleteFile(id) {
    let files = getFiles();
    const file = files.find(f => f.id === id);
    if (!file) return;
    if (!confirm(`确定删除「${file.name}」吗？`)) return;
    files = files.filter(f => f.id !== id);
    if (!files.length) {
      files.push({ id: 'file-' + Date.now(), name: '未命名文档', content: '', createdAt: Date.now(), updatedAt: Date.now() });
    }
    localStorage.setItem(FILES_KEY, JSON.stringify(files));
    if (getCurrentFileId() === id) {
      localStorage.setItem(CURRENT_FILE_KEY, files[0].id);
      switchFile(files[0].id);
    } else {
      renderFileList();
    }
  }

  function toggleSidebar() {
    const open = sidebar.classList.toggle('open');
    document.body.classList.toggle('sidebar-open', open);
    if (open) renderFileList();
  }

  // ===== 同步滚动 =====
  let isSyncing = false;
  function syncScrollFrom(source, target) {
    if (isSyncing) return;
    const maxSource = source.scrollHeight - source.clientHeight;
    const maxTarget = target.scrollHeight - target.clientHeight;
    if (maxSource <= 0 || maxTarget <= 0) return;
    const ratio = source.scrollTop / maxSource;
    isSyncing = true;
    target.scrollTop = ratio * maxTarget;
    requestAnimationFrame(() => { isSyncing = false; });
  }

  // ===== 分隔条拖拽 =====
  function initResizer() {
    let dragging = false;
    resizer.addEventListener('mousedown', (e) => {
      dragging = true;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const container = resizer.parentElement.getBoundingClientRect();
      const sidebarOffset = document.body.classList.contains('sidebar-open') ? sidebar.offsetWidth : 0;
      let ratio = (e.clientX - container.left - sidebarOffset) / (container.width - sidebarOffset);
      ratio = Math.min(0.8, Math.max(0.2, ratio));
      editorPane.style.flex = `0 0 ${ratio * 100}%`;
      previewPane.style.flex = `0 0 ${(1 - ratio) * 100}%`;
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  // ===== 自定义 Tooltip =====
  function initTooltips() {
    if (!tooltipEl) return;
    document.querySelectorAll('[title]').forEach((el) => {
      if (el.dataset.tooltipBound) return;
      const title = el.getAttribute('title');
      if (!title) return;
      el.dataset.tooltip = title;
      el.removeAttribute('title');
      el.dataset.tooltipBound = '1';
      el.addEventListener('mouseenter', () => {
        tooltipEl.textContent = el.dataset.tooltip;
        tooltipEl.classList.add('show');
        const rect = el.getBoundingClientRect();
        const tipRect = tooltipEl.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - tipRect.width / 2;
        left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
        tooltipEl.style.left = left + 'px';
        tooltipEl.style.top = rect.bottom + 6 + 'px';
      });
      el.addEventListener('mouseleave', () => {
        tooltipEl.classList.remove('show');
      });
    });
  }

  // ===== 弹窗 =====
  function openModal(id) {
    document.getElementById(id).classList.add('active');
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove('active');
  }

  // ===== 内容变更 =====
  function onContentChange() {
    renderPreview();
    updateLineNumbers();
    updateCursorPos();
    scheduleSave();
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    editor.addEventListener('input', onContentChange);
    editor.addEventListener('keyup', updateCursorPos);
    editor.addEventListener('click', updateCursorPos);

    editor.addEventListener('scroll', () => {
      syncLineNumbersScroll();
      if (syncScroll) syncScrollFrom(editor, preview);
    });
    preview.addEventListener('scroll', () => {
      if (syncScroll) syncScrollFrom(preview, editor);
    });

    syncScrollCheck.checked = syncScroll;
    syncScrollCheck.addEventListener('change', () => {
      syncScroll = syncScrollCheck.checked;
      localStorage.setItem(SYNC_SCROLL_KEY, syncScroll ? 'on' : 'off');
    });

    // 工具栏
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        e.preventDefault();
        switch (action) {
          case 'toggle-sidebar': toggleSidebar(); break;
          case 'new-file': createFile(); break;
          case 'theme': toggleTheme(); break;
          case 'line-numbers': toggleLineNumbers(); break;
          case 'preview-only': togglePreviewOnly(); break;
          case 'import-md': importFile.click(); break;
          case 'download-md': downloadMd(); break;
          case 'download-html': downloadHtml(); break;
          case 'clear':
            if (confirm('确定清空当前内容吗？')) {
              editor.value = '';
              onContentChange();
            }
            break;
          case 'help': openModal('help-modal'); break;
          default: insertMarkdown(action);
        }
      });
    });

    // 文件列表操作
    fileListEl.addEventListener('click', (e) => {
      const renameBtn = e.target.closest('[data-file-rename]');
      const deleteBtn = e.target.closest('[data-file-delete]');
      if (renameBtn) renameFile(renameBtn.dataset.fileRename);
      if (deleteBtn) deleteFile(deleteBtn.dataset.fileDelete);
    });

    // 导入
    importFile.addEventListener('change', () => {
      const file = importFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        editor.value = String(reader.result || '');
        onContentChange();
        importFile.value = '';
      };
      reader.readAsText(file);
    });

    // 弹窗关闭
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });

    // 预览区点击：代码复制 / 图片放大
    preview.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('.hljs-copy-btn');
      if (copyBtn) {
        const code = copyBtn.parentElement.querySelector('code');
        navigator.clipboard.writeText(code ? code.innerText : '').then(() => {
          copyBtn.textContent = '已复制';
          setTimeout(() => { copyBtn.textContent = '复制'; }, 1200);
        });
        return;
      }
      const img = e.target.closest('img');
      if (img) {
        const overlay = document.getElementById('img-preview');
        document.getElementById('img-preview-img').src = img.src;
        overlay.classList.add('active');
      }
    });
    document.getElementById('img-preview').addEventListener('click', function () {
      this.classList.remove('active');
    });

    // 快捷键
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (e.shiftKey) {
          // 取消缩进
          const before = editor.value.substring(0, start);
          const lineStart = before.lastIndexOf('\n') + 1;
          if (editor.value.substring(lineStart, lineStart + 2) === '  ') {
            editor.setRangeText('', lineStart, lineStart + 2, 'end');
            editor.setSelectionRange(Math.max(lineStart, start - 2), Math.max(lineStart, end - 2));
          }
        } else {
          editor.setRangeText('  ', start, end, 'end');
        }
        onContentChange();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'b') { e.preventDefault(); insertMarkdown('bold'); }
      else if (key === 'i') { e.preventDefault(); insertMarkdown('italic'); }
      else if (key === 'u') { e.preventDefault(); insertMarkdown('underline'); }
      else if (key === 'k') { e.preventDefault(); insertMarkdown('link'); }
      else if (key === 's') { e.preventDefault(); saveNow(); }
      else if (key === '/') {
        e.preventDefault();
        const start = editor.selectionStart;
        const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = editor.value.indexOf('\n', start);
        const line = editor.value.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);
        editor.setRangeText(`<!-- ${line} -->`, lineStart, lineEnd === -1 ? editor.value.length : lineEnd, 'end');
        onContentChange();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active, .img-preview-overlay.active')
          .forEach(el => el.classList.remove('active'));
      }
    });

    window.addEventListener('beforeunload', saveNow);
  }

  // ===== 初始化 =====
  function init() {
    initFiles();
    setupMarked();

    const file = getFiles().find(f => f.id === getCurrentFileId());
    editor.value = file ? file.content : DEFAULT_CONTENT;

    // 行号默认显示
    if (localStorage.getItem(LINE_NUMBERS_KEY) !== 'off') {
      lineNumbers.classList.add('show');
      document.getElementById('line-numbers-toggle').classList.add('active');
    }

    bindEvents();
    initResizer();
    initTooltips();
    renderFileList();

    renderPreview();
    updateLineNumbers();

    // 光标移到文末
    editor.setSelectionRange(editor.value.length, editor.value.length);
    updateCursorPos();
    saveStatus.textContent = '已保存';

    // 隐藏加载页
    const loader = document.getElementById('page-loader');
    setTimeout(() => loader.classList.add('hidden'), 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  } else {
    setTimeout(init, 0);
  }
})();
