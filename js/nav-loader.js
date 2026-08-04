// nav-loader.js — 导航统一加载器
// 负责：加载 nav.html → 标记 active → 移动端菜单 → 底部 Tab → 主题切换
//       图钉锁定侧边栏 → 日程待办徽标

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // 1. 加载 nav.html 到 #sidebar
  // ═══════════════════════════════════════════════════════════
  async function loadNav() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // 自动注入 nav.css（如果页面还没有引用）
    if (!document.querySelector('link[href*="nav.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/css/nav.css';
      document.head.appendChild(link);
    }

    try {
      const res = await fetch('/nav.html');
      if (!res.ok) throw new Error('nav.html 加载失败');
      sidebar.innerHTML = await res.text();

      // 标记当前页面为 active
      markActivePage(sidebar);
    } catch (err) {
      console.error('导航加载失败：', err);
    }
  }

  function markActivePage(sidebar) {
    const currentPath = location.pathname;
    sidebar.querySelectorAll('a').forEach(function (link) {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && href === currentPath) {
        link.classList.add('active');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 2. 移动端汉堡菜单（所有页面通用）
  // ═══════════════════════════════════════════════════════════
  function setupMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // 自动创建遮罩层（如果页面没有）
    let overlay = document.getElementById('menuOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'menu-overlay';
      overlay.id = 'menuOverlay';
      document.body.appendChild(overlay);
    }

    // 自动创建汉堡按钮（如果页面没有）
    let menuBtn = document.getElementById('mobileMenuBtn');
    if (!menuBtn) {
      menuBtn = document.createElement('div');
      menuBtn.className = 'mobile-menu-btn';
      menuBtn.id = 'mobileMenuBtn';
      menuBtn.innerHTML = '<i class="fa fa-bars"></i>';
      document.body.appendChild(menuBtn);
    }

    // 关闭菜单
    function closeMenu() {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    }

    // 打开菜单
    function openMenu() {
      sidebar.classList.add('mobile-open');
      overlay.classList.add('active');
    }

    // 汉堡按钮点击
    menuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (sidebar.classList.contains('mobile-open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // 点击遮罩关闭
    overlay.addEventListener('click', closeMenu);

    // 点击侧边栏内链接后自动关闭
    sidebar.addEventListener('click', function (e) {
      if (e.target.closest('a') && window.innerWidth <= 1024) {
        setTimeout(closeMenu, 150);
      }
    });

    // ESC 关闭
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
        closeMenu();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 3. 移动端底部 Tab 栏（仅 todo.html 日程页面）
  // ═══════════════════════════════════════════════════════════
  function setupMobileTabs() {
    // 只在日程页面注入底部 Tab 栏
    if (location.pathname !== '/todo.html' && location.pathname !== '/') return;

    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone|Mobile/i.test(ua);
    if (!isMobile) return;

    // 防止重复注入
    if (document.querySelector('.mobile-tab-bar')) return;

    var nav = document.createElement('nav');
    nav.className = 'mobile-tab-bar';
    nav.innerHTML =
      '<button class="tab-item active" data-view="day">' +
        '<i class="fa fa-calendar"></i><span>日程</span>' +
      '</button>' +
      '<button class="tab-item" data-view="week">' +
        '<i class="fa fa-calendar-week-o"></i><span>周</span>' +
      '</button>' +
      '<button class="tab-item" data-view="month">' +
        '<i class="fa fa-calendar-o"></i><span>月</span>' +
      '</button>' +
      '<button class="tab-item" id="tab-ai">' +
        '<i class="fa fa-comments"></i><span>AI</span>' +
      '</button>' +
      '<button class="tab-item" id="tab-stats">' +
        '<i class="fa fa-pie-chart"></i><span>统计</span>' +
      '</button>';
    document.body.appendChild(nav);

    // 切换视图按钮
    nav.querySelectorAll('.tab-item[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = this.dataset.view;
        nav.querySelectorAll('.tab-item').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');

        if (v === 'day') {
          var el = document.getElementById('day-view-btn');
          if (el) el.click();
        } else if (v === 'week') {
          var el = document.getElementById('week-view-btn');
          if (el) el.click();
        } else if (v === 'month') {
          var el = document.getElementById('month-view-btn');
          if (el) el.click();
        }
      });
    });

    // AI 按钮
    var aiBtn = nav.querySelector('#tab-ai');
    if (aiBtn) {
      aiBtn.addEventListener('click', function () {
        var el = document.getElementById('ai-chat-toggle');
        if (el) el.click();
      });
    }

    // 统计按钮
    var statsBtn = nav.querySelector('#tab-stats');
    if (statsBtn) {
      statsBtn.addEventListener('click', function () {
        var el = document.querySelector('.progress-circle');
        if (el && el.closest('.bg-white')) {
          el.closest('.bg-white').scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    // 同步 PC 视图按钮的 active 状态
    ['day-view-btn', 'week-view-btn', 'month-view-btn'].forEach(function (id, i) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', function () {
          var map = ['day', 'week', 'month'];
          nav.querySelectorAll('.tab-item[data-view]').forEach(function (b) {
            b.classList.toggle('active', b.dataset.view === map[i]);
          });
        });
      }
    });

    document.body.classList.add('has-mobile-tabs');
  }

  // ═══════════════════════════════════════════════════════════
  // 4. 主题切换
  // ═══════════════════════════════════════════════════════════
  function setupThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    // 读取保存的主题
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      btn.textContent = '☀️';
    }

    btn.addEventListener('click', function () {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        btn.textContent = '🌙';
        localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        btn.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 5. 图钉锁定侧边栏
  // ═══════════════════════════════════════════════════════════
  function setupPin() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const pinBtn = document.getElementById('sidebarPin');
    if (!pinBtn) return;

    // 读取保存的锁定状态
    const saved = localStorage.getItem('nav-pinned');
    if (saved === 'true') {
      sidebar.classList.add('pinned');
    }

    pinBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isPinned = sidebar.classList.toggle('pinned');
      localStorage.setItem('nav-pinned', isPinned ? 'true' : 'false');
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 6. 日程待办徽标（异步加载今日未完成任务数）
  // ═══════════════════════════════════════════════════════════
  async function updateTodoBadge() {
    const badge = document.getElementById('nav-todo-badge');
    if (!badge) return;

    try {
      const res = await fetch('/api/events');
      if (!res.ok) return;
      const events = await res.json();

      // 今日日期
      const today = new Date();
      const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

      // 筛选今日未完成任务
      const pending = (Array.isArray(events) ? events : []).filter(function (e) {
        return e.date === todayStr && !e.completed;
      });

      if (pending.length > 0) {
        badge.textContent = pending.length;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    } catch (err) {
      // 静默失败 — 徽标不影响核心功能
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 7. Auth 状态和 Token 管理
  // ═══════════════════════════════════════════════════════════
  var TOKEN_KEY = 'auth_token';
  var AUTH = { loggedIn: false, username: 'admin', isDefaultPassword: false };

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function authFetch(url, options) {
    options = options || {};
    var headers = options.headers || {};
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    options.headers = headers;
    return fetch(url, options);
  }

  function updateAuthUI() {
    var avatarEl = document.getElementById('userAvatar');
    var nameEl = document.getElementById('userName');
    var labelEl = document.getElementById('userLabel');
    var badgeEl = document.getElementById('syncBadge');
    var userArea = document.getElementById('sidebarUser');

    var personSVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 22c2-4 4-6 8-6s6 2 8 6"/></svg>';

    if (AUTH.loggedIn) {
      var profile = loadProfile();
      if (avatarEl) {
        avatarEl.style.background = profile.avatar;
        avatarEl.style.color = '#fff';
        avatarEl.innerHTML = personSVG;
      }
      if (nameEl) nameEl.textContent = profile.name;
      if (labelEl) labelEl.textContent = '已同步';
      if (badgeEl) badgeEl.style.display = 'flex';
      if (userArea) userArea.title = '点击编辑个人信息';
    } else {
      if (avatarEl) {
        avatarEl.style.background = 'var(--fill-tertiary)';
        avatarEl.style.color = 'var(--text-tertiary)';
        avatarEl.innerHTML = personSVG;
      }
      if (nameEl) nameEl.textContent = '未登录';
      if (labelEl) labelEl.textContent = '点击登录';
      if (badgeEl) badgeEl.style.display = 'none';
      if (userArea) userArea.title = '点击登录';
    }

    // 切换登出按钮可见性
    var logoutSep = document.getElementById('logoutSeparator');
    var logoutBtn = document.getElementById('sp-logout');
    if (logoutSep) logoutSep.style.display = AUTH.loggedIn ? 'block' : 'none';
    if (logoutBtn) logoutBtn.style.display = AUTH.loggedIn ? 'flex' : 'none';
  }

  async function checkAuthStatus() {
    var token = getToken();
    if (!token) { updateAuthUI(); return; }
    try {
      var res = await authFetch('/api/auth/status');
      if (res.ok) {
        var data = await res.json();
        AUTH.loggedIn = true;
        AUTH.isDefaultPassword = data.user.isDefaultPassword;
        AUTH.username = data.user.username;
        updateAuthUI();
        if (AUTH.isDefaultPassword) {
          setTimeout(function () { showChangePwModal(true); }, 800);
        }
      } else {
        clearToken();
        updateAuthUI();
      }
    } catch (err) {
      // 服务器不可达，保持当前状态
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 8. 用户头像和名称
  // ═══════════════════════════════════════════════════════════
  var USER_DEFAULTS = { name: '用户', avatar: '#5B9BD5' };

  function loadProfile() {
    try {
      var raw = localStorage.getItem('nav-user-profile');
      if (!raw) return USER_DEFAULTS;
      var profile = JSON.parse(raw);
      // 兼容旧版 emoji 头像：迁移为颜色
      if (!profile.avatar || profile.avatar.length <= 4) {
        profile.avatar = USER_DEFAULTS.avatar;
      }
      return profile;
    } catch (e) {
      return USER_DEFAULTS;
    }
  }

  function saveProfile(profile) {
    localStorage.setItem('nav-user-profile', JSON.stringify(profile));
  }

  function applyProfile() {
    var profile = loadProfile();
    var avatarEl = document.getElementById('userAvatar');
    var nameEl = document.getElementById('userName');
    if (avatarEl) {
      avatarEl.style.background = profile.avatar;
      avatarEl.style.color = '#fff';
      avatarEl.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 22c2-4 4-6 8-6s6 2 8 6"/></svg>';
    }
    if (nameEl) nameEl.textContent = profile.name;
  }

  function setupUserProfile() {
    applyProfile();

    // 点击用户区 → 打开编辑弹窗
    var userArea = document.getElementById('sidebarUser');
    var modal = document.getElementById('profileModal');
    if (!userArea || !modal) return;

    userArea.addEventListener('click', function () {
      // 未登录 → 弹出登录框；已登录 → 编辑个人资料
      if (!AUTH.loggedIn) {
        if (window.openLoginModal) { window.openLoginModal(); }
        return;
      }
      var profile = loadProfile();
      document.getElementById('profileNameInput').value = profile.name;
      modal.style.display = 'flex';

      // 高亮当前头像颜色
      var picker = document.getElementById('avatarPicker');
      if (picker) {
        picker.querySelectorAll('button').forEach(function (btn) {
          btn.classList.toggle('selected', btn.dataset.color === profile.avatar);
        });
      }
    });

    // 头像颜色选择
    var picker = document.getElementById('avatarPicker');
    if (picker) {
      picker.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn || !btn.dataset.color) return;
        picker.querySelectorAll('button').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    }

    // 取消
    document.getElementById('profileCancel').addEventListener('click', function () {
      modal.style.display = 'none';
    });

    // 保存
    document.getElementById('profileSave').addEventListener('click', function () {
      var nameInput = document.getElementById('profileNameInput');
      var name = nameInput.value.trim() || USER_DEFAULTS.name;

      var selectedBtn = picker ? picker.querySelector('button.selected') : null;
      var avatar = selectedBtn ? selectedBtn.dataset.color : USER_DEFAULTS.avatar;

      saveProfile({ name: name, avatar: avatar });
      applyProfile();
      modal.style.display = 'none';
    });

    // 点击遮罩关闭
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.style.display = 'none';
    });

    // ESC 关闭
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        modal.style.display = 'none';
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 8. 设置弹出面板
  // ═══════════════════════════════════════════════════════════
  function setupSettingsPopover() {
    var settingsBtn = document.getElementById('sidebarSettings');
    if (!settingsBtn) return;

    // 创建弹出面板
    var popover = document.createElement('div');
    popover.className = 'settings-popover';
    popover.id = 'settingsPopover';
    popover.innerHTML =
      '<button id="sp-edit-profile"><i class="fa fa-user-edit"></i> 编辑个人信息</button>' +
      '<button id="sp-clear-cache"><i class="fa fa-broom"></i> 清理本地缓存</button>' +
      '<div class="popover-separator"></div>' +
      '<button id="sp-reset-nav"><i class="fa fa-rotate-left"></i> 重置导航状态</button>' +
      '<div class="popover-separator" id="logoutSeparator" style="display:none;"></div>' +
      '<button id="sp-logout" style="display:none;"><i class="fa fa-sign-out"></i> 退出登录</button>' +
      '<div class="popover-separator"></div>' +
      '<div class="popover-version">v2.2 · 人类生活实验日志</div>';
    document.body.appendChild(popover);

    function togglePopover() {
      var isOpen = popover.classList.contains('show');
      popover.classList.toggle('show', !isOpen);
      // 定位在设置按钮上方
      if (!isOpen) {
        var rect = settingsBtn.getBoundingClientRect();
        popover.style.left = Math.min(rect.right + 8, window.innerWidth - 216) + 'px';
        popover.style.bottom = (window.innerHeight - rect.top) + 'px';
      }
    }

    settingsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePopover();
    });

    // 编辑个人信息
    popover.querySelector('#sp-edit-profile').addEventListener('click', function () {
      popover.classList.remove('show');
      var userArea = document.getElementById('sidebarUser');
      if (userArea) userArea.click();
    });

    // 清理缓存
    popover.querySelector('#sp-clear-cache').addEventListener('click', function () {
      if (confirm('确定清理所有本地缓存数据吗？\n（不包括财务记录和日程数据）')) {
        localStorage.removeItem('theme');
        localStorage.removeItem('nav-pinned');
        localStorage.removeItem('nav-user-profile');
        popover.classList.remove('show');
        // 刷新显示
        applyProfile();
        var pinBtn = document.getElementById('sidebarPin');
        var sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('pinned');
        showToast('缓存已清理');
      }
    });

    // 重置导航状态
    popover.querySelector('#sp-reset-nav').addEventListener('click', function () {
      if (confirm('确定重置导航状态吗？（图钉、用户信息、主题将被重置）')) {
        localStorage.removeItem('nav-pinned');
        localStorage.removeItem('nav-user-profile');
        localStorage.removeItem('theme');
        localStorage.removeItem(TOKEN_KEY);
        document.documentElement.removeAttribute('data-theme');
        var sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('pinned');
        AUTH.loggedIn = false;
        saveProfile(USER_DEFAULTS);
        applyProfile();
        updateAuthUI();
        popover.classList.remove('show');
        setupThemeToggle();
        showToast('导航状态已重置');
      }
    });

    // 退出登录
    var logoutBtn = popover.querySelector('#sp-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (confirm('确定退出登录吗？')) {
          clearToken();
          AUTH.loggedIn = false;
          updateAuthUI();
          popover.classList.remove('show');
          showToast('已退出登录');
        }
      });
    }

    // 点击外部关闭
    document.addEventListener('click', function (e) {
      if (!popover.contains(e.target) && e.target !== settingsBtn && !settingsBtn.contains(e.target)) {
        popover.classList.remove('show');
      }
    });
  }

  // Toast（轻量，不依赖外部）
  function showToast(msg) {
    var t = document.getElementById('nav-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'nav-toast';
      t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:10px 22px;border-radius:40px;font-size:13px;z-index:9999;pointer-events:none;opacity:0;transition:opacity 0.25s;font-weight:500;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.opacity = '0'; }, 2000);
  }
  window.showToast = showToast; // 暴露给全局

  // ═══════════════════════════════════════════════════════════
  // 10. 登录弹窗
  // ═══════════════════════════════════════════════════════════
  function setupLoginModal() {
    var modal = document.getElementById('loginModal');
    var userInput = document.getElementById('loginUserInput');
    var passwordInput = document.getElementById('loginPasswordInput');
    var errorEl = document.getElementById('loginError');

    if (!modal || !passwordInput) return;

    function hideLoginModal() { modal.style.display = 'none'; }

    window.openLoginModal = function () {
      errorEl.style.display = 'none';
      userInput.value = '';
      passwordInput.value = '';
      modal.style.display = 'flex';
      setTimeout(function () { passwordInput.focus(); }, 100);
    };

    document.getElementById('loginConfirm').addEventListener('click', async function () {
      var username = userInput.value.trim() || 'admin';
      var password = passwordInput.value.trim();
      if (!password) {
        errorEl.textContent = '请输入密码';
        errorEl.style.display = 'block';
        return;
      }
      try {
        var res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, password: password })
        });
        var data = await res.json();
        if (res.ok && data.success) {
          setToken(data.token);
          AUTH.loggedIn = true;
          AUTH.isDefaultPassword = data.user.isDefaultPassword;
          AUTH.username = data.user.username;
          hideLoginModal();
          updateAuthUI();
          showToast('登录成功 ☁️');

          if (AUTH.isDefaultPassword) {
            setTimeout(function () { showChangePwModal(true); }, 600);
          }
          // 检查是否有 guest 数据可迁移
          checkGuestData();
        } else {
          errorEl.textContent = data.message || '密码错误';
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = '网络错误，请稍后重试';
        errorEl.style.display = 'block';
      }
    });

    document.getElementById('loginCancel').addEventListener('click', hideLoginModal);

    passwordInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('loginConfirm').click();
    });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) hideLoginModal();
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 11a. 注册弹窗
  // ═══════════════════════════════════════════════════════════
  function setupRegisterModal() {
    var loginModal = document.getElementById('loginModal');
    var regModal = document.getElementById('registerModal');
    var regUser = document.getElementById('regUserInput');
    var regPw = document.getElementById('regPwInput');
    var regError = document.getElementById('regError');
    var showRegLink = document.getElementById('showRegisterLink');

    if (!regModal || !showRegLink) return;

    showRegLink.addEventListener('click', function (e) {
      e.preventDefault();
      loginModal.style.display = 'none';
      regError.style.display = 'none';
      regUser.value = '';
      regPw.value = '';
      regModal.style.display = 'flex';
      setTimeout(function () { regUser.focus(); }, 100);
    });

    document.getElementById('regConfirm').addEventListener('click', async function () {
      var username = regUser.value.trim();
      var password = regPw.value.trim();

      if (username.length < 2) { regError.textContent = '用户名至少2个字符'; regError.style.display = 'block'; return; }
      if (password.length < 6) { regError.textContent = '密码至少6位'; regError.style.display = 'block'; return; }

      try {
        var res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, password: password })
        });
        var data = await res.json();
        if (res.ok && data.success) {
          setToken(data.token);
          AUTH.loggedIn = true;
          AUTH.isDefaultPassword = false;
          AUTH.username = data.user.username;
          regModal.style.display = 'none';
          updateAuthUI();
          showToast('注册成功，已自动登录 ☁️');
        } else {
          regError.textContent = data.message || '注册失败';
          regError.style.display = 'block';
        }
      } catch (err) {
        regError.textContent = '网络错误，请稍后重试';
        regError.style.display = 'block';
      }
    });

    document.getElementById('regCancel').addEventListener('click', function () {
      regModal.style.display = 'none';
      loginModal.style.display = 'flex';
    });

    regModal.addEventListener('click', function (e) {
      if (e.target === regModal) regModal.style.display = 'none';
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 11b. 数据迁移
  // ═══════════════════════════════════════════════════════════
  async function checkGuestData() {
    if (!AUTH.loggedIn) return;
    try {
      var res = await authFetch('/api/events');
      if (res.ok) {
        var events = await res.json();
        // 新用户登录：如果有 guest 数据（user_id=NULL），提示迁移
        // 但登录后的 /api/events 已经返回 user-scoped 数据，看不到 guest 的了
        // 我们可以通过单独检查来提示
      }
    } catch (e) {}

    // 简单提示用户是否需要迁移（首次登录后）
    var migrated = localStorage.getItem('auth_migrated_' + AUTH.username);
    if (!migrated) {
      var migrateModal = document.getElementById('migrateModal');
      if (migrateModal) {
        setTimeout(function () { migrateModal.style.display = 'flex'; }, 1200);
      }
    }
  }

  function setupMigrateModal() {
    var modal = document.getElementById('migrateModal');
    if (!modal) return;

    document.getElementById('migrateConfirm').addEventListener('click', async function () {
      try {
        var res = await authFetch('/api/auth/migrate', { method: 'POST' });
        var data = await res.json();
        if (data.success) {
          showToast(data.message || '迁移完成');
          localStorage.setItem('auth_migrated_' + AUTH.username, 'true');
        }
      } catch (e) {}
      modal.style.display = 'none';
    });

    document.getElementById('migrateSkip').addEventListener('click', function () {
      localStorage.setItem('auth_migrated_' + AUTH.username, 'true');
      modal.style.display = 'none';
    });

    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 12. 修改密码弹窗
  // ═══════════════════════════════════════════════════════════
  function showChangePwModal(skipable) {
    var modal = document.getElementById('changePwModal');
    var errorEl = document.getElementById('cpError');
    if (!modal) return;

    errorEl.style.display = 'none';
    document.getElementById('cpCurrentInput').value = '';
    document.getElementById('cpNewInput').value = '';
    document.getElementById('cpCancel').style.display = skipable ? '' : 'none';
    modal.style.display = 'flex';
  }

  function setupChangePasswordModal() {
    var modal = document.getElementById('changePwModal');
    var errorEl = document.getElementById('cpError');
    if (!modal) return;

    function hideModal() { modal.style.display = 'none'; }

    document.getElementById('cpConfirm').addEventListener('click', async function () {
      var currentPw = document.getElementById('cpCurrentInput').value.trim();
      var newPw = document.getElementById('cpNewInput').value.trim();

      if (!currentPw) { errorEl.textContent = '请输入当前密码'; errorEl.style.display = 'block'; return; }
      if (newPw.length < 6) { errorEl.textContent = '新密码至少6位'; errorEl.style.display = 'block'; return; }

      try {
        var res = await authFetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw })
        });
        var data = await res.json();
        if (res.ok && data.success) {
          hideModal();
          AUTH.isDefaultPassword = false;
          updateAuthUI();
          showToast('密码修改成功 ✅');
        } else {
          errorEl.textContent = data.message || '修改失败';
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = '网络错误，请稍后重试';
        errorEl.style.display = 'block';
      }
    });

    document.getElementById('cpCancel').addEventListener('click', hideModal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) hideModal();
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 12. 初始化
  // ═══════════════════════════════════════════════════════════
  function init() {
    loadNav().then(function () {
      setupMobileMenu();
      setupMobileTabs();
      setupThemeToggle();
      setupPin();
      updateTodoBadge();
      setupUserProfile();
      setupSettingsPopover();
      setupLoginModal();
      setupRegisterModal();
      setupMigrateModal();
      setupChangePasswordModal();
      checkAuthStatus();
    });
  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
