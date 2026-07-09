// 改成（相对路径，自动跟随域名）：
const API_BASE = '/api';

// 自动附加登录 token 到 API 请求
const _origFetch = window.fetch;
window.fetch = function(url, opts) {
  opts = opts || {};
  const token = localStorage.getItem('auth_token');
  if (token && typeof url === 'string' && url.startsWith('/api')) {
    opts.headers = opts.headers || {};
    opts.headers['Authorization'] = 'Bearer ' + token;
  }
  return _origFetch.call(window, url, opts);
};

// escapeHtml() 和 showToast() 由 /js/utils.js 提供

// ===== 全局状态管理 =====
const store = {
    events: [],
    currentDate: new Date(),
    selectedDate: new Date(),
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    currentView: 'day',
    currentFilter: '全部'
};

// ===== 统一刷新 UI（替代重复的 7 函数链）=====
function refreshAll() {
    renderFilterButtons();
    renderCalendar();
    renderEventList(store.currentFilter || '全部');
    renderWeekView();
    renderMonthView();
    renderUpcomingEvents();
    updateEventStats();
    updateProgressStats();
}

// ===== 全局 loading 状态 =====
let isLoading = false;

function showLoading(text = '加载中...') {
    let overlay = document.getElementById('api-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'api-loading-overlay';
        overlay.innerHTML = '<i class="fa fa-spinner fa-spin"></i><span id="api-loading-text"></span>';
        document.body.appendChild(overlay);
    }
    document.getElementById('api-loading-text').textContent = text;
    overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('api-loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

// ===== 事件数组（从后端加载） =====
let events = [];

// 分类颜色映射（通用哈希，不硬编码类别名）
function getCatIndex(name) {
  // 简单 hash：对名称每个字符求和取模
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 8;
}
function getCatLight(name) { return 'cat-light-' + getCatIndex(name); }
function getCatText(name) { return 'cat-text-' + getCatIndex(name); }

// 兼容旧代码的映射（动态生成）
const lightCategoryColors = new Proxy({}, {
  get: (_, name) => getCatLight(String(name))
});
const textCategoryColors = new Proxy({}, {
  get: (_, name) => getCatText(String(name))
});

// 当前视图
let currentView = 'day';

// DOM元素
const calendarGrid = document.getElementById('calendar-grid');
const currentMonthElement = document.getElementById('current-month');
const selectedDateElement = document.getElementById('selected-date');
const dayOfWeekElement = document.getElementById('day-of-week');
const eventList = document.getElementById('event-list');
const emptyState = document.getElementById('empty-state');
const emptyAddBtn = document.getElementById('empty-add-btn');
const addEventBtn = document.getElementById('add-event-btn');
const eventModal = document.getElementById('event-modal');
const modalContent = document.getElementById('modal-content');
const closeModal = document.getElementById('close-modal');
const modalTitle = document.getElementById('modal-title');
const eventForm = document.getElementById('event-form');
const eventId = document.getElementById('event-id');
const eventTitle = document.getElementById('event-title');
const eventDate = document.getElementById('event-date');
const eventTime = document.getElementById('event-time');
const eventCategory = document.getElementById('event-category');
const eventDescription = document.getElementById('event-description');
const eventReminder = document.getElementById('event-reminder');
const eventRecurrence = document.getElementById('event-recurrence');
const eventRecurrenceEnd = document.getElementById('event-recurrence-end');
const recurrenceEndGroup = document.getElementById('recurrence-end-group');
const cancelEventBtn = document.getElementById('cancel-event');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const todayBtn = document.getElementById('today-btn');
const upcomingEvents = document.getElementById('upcoming-events');
const totalEventsElement = document.getElementById('total-events');
const completedEventsElement = document.getElementById('completed-events');
const pendingEventsElement = document.getElementById('pending-events');
const progressCircle = document.getElementById('progress-circle');
const progressText = document.getElementById('progress-text');
const filterButtons = document.querySelectorAll('.filter-btn');
const dayViewBtn = document.getElementById('day-view-btn');
const weekViewBtn = document.getElementById('week-view-btn');
const monthViewBtn = document.getElementById('month-view-btn');
const dayView = document.getElementById('day-view');
const weekView = document.getElementById('week-view');
const monthView = document.getElementById('month-view');
const weekGrid = document.getElementById('week-grid');
const monthGrid = document.getElementById('month-grid');
const progressTitle = document.getElementById('progress-title');
const progressSubtitle = document.getElementById('progress-subtitle');
const importDataBtn = document.getElementById('import-data-btn');
const exportDataBtn = document.getElementById('export-data-btn');
const importModal = document.getElementById('import-modal');
const closeImportModal = document.getElementById('close-import-modal');
const cancelImport = document.getElementById('cancel-import');
const confirmImport = document.getElementById('confirm-import');
const jsonFileInput = document.getElementById('json-file');
const jsonDataTextarea = document.getElementById('json-data');

// 子任务相关DOM元素
const subtasksContainer = document.getElementById('subtasks-container');
const addSubtaskBtn = document.getElementById('add-subtask-btn');

// 导航栏相关DOM元素
const sidebar = document.querySelector('.sidebar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');

// 当前选中的日期
let currentDate = new Date();
let selectedDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();

// ========== 任务点计算函数 ==========
function calculateTaskPointCompletion(event) {
    if (!event.subtasks || event.subtasks.length === 0) {
        return {
            totalPoints: 1,
            completedPoints: !!event.completed ? 1 : 0
        };
    } else {
        const totalPoints = event.subtasks.length;
        const completedPoints = event.subtasks.filter(st => !!st.completed).length;
        return { totalPoints, completedPoints };
    }
}

function calculateOverallCompletion(eventsList) {
    if (eventsList.length === 0) {
        return { percentage: 0, completedPoints: 0, totalPoints: 0 };
    }
    let totalPoints = 0;
    let completedPoints = 0;
    eventsList.forEach(event => {
        const points = calculateTaskPointCompletion(event);
        totalPoints += points.totalPoints;
        completedPoints += points.completedPoints;
    });
    const percentage = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;
    return { percentage, completedPoints, totalPoints };
}

function updateTaskPointStats(completedPoints, totalPoints) {
    const existingPointStats = document.getElementById('point-stats');
    if (existingPointStats) existingPointStats.remove();
    if (totalPoints > 0) {
        const pointStats = document.createElement('div');
        pointStats.id = 'point-stats';
        pointStats.className = 'mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500 text-center';
        pointStats.innerHTML = `任务点完成：${completedPoints}/${totalPoints} (${Math.round((completedPoints / totalPoints) * 100)}%)`;
        const statsContainer = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-3.gap-4');
        if (statsContainer) statsContainer.appendChild(pointStats);
    }
}

// 动态生成分类筛选按钮
function renderFilterButtons() {
    const container = document.getElementById('filter-buttons-container');
    if (!container) return;

    // 保留"全部"按钮，清除其余
    const allBtn = container.querySelector('[data-filter="全部"]');
    container.querySelectorAll('.filter-btn:not([data-filter="全部"])').forEach(b => b.remove());

    // 收集实际使用的类别
    const catSet = new Set();
    events.forEach(e => { if (e.category) catSet.add(e.category); });

    // 按固定顺序：工作 → 生活 → 其他
    const catOrder = ['工作', '生活', '其他'];
    [...catSet].sort((a, b) => {
        const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }).forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600';
        btn.setAttribute('data-filter', cat);
        btn.textContent = cat;
        // highlight active
        if (store.currentFilter === cat) {
            btn.classList.remove('bg-gray-100', 'text-gray-600');
            btn.classList.add('active', 'bg-primary/10', 'text-primary');
        }
        container.appendChild(btn);
    });
}

// 初始化
async function init() {
    setupEventListeners();
    renderCalendar();           // 第1次：先渲染日历框架（避免空白）
    updateSelectedDateInfo();
    await loadEventsFromAPI();  // 加载后端数据
    renderFilterButtons();      // 动态生成分类按钮
    renderCalendar();           // 第2次：★关键★ 数据加载后重新渲染，显示小圆点
    renderEventList();
    renderUpcomingEvents();
    updateEventStats();
    updateProgressStats();
    renderWeekView();
    renderMonthView();
}

// ===== 从后端 API 加载所有事件（修正版）=====
async function loadEventsFromAPI() {
    showLoading('正在加载数据...');
    try {
        const res = await fetch(`${API_BASE}/events`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        events = await res.json();

        // 转换 completed 字段为布尔值，并确保 subtasks 存在
        events = events.map(event => {
            // 主事件完成状态 - 使用 !! 统一转换为布尔值
            event.completed = !!event.completed;
            // 子任务完成状态
            if (event.subtasks && Array.isArray(event.subtasks)) {
                event.subtasks = event.subtasks.map(st => ({
                    ...st,
                    completed: !!st.completed
                }));
            } else {
                event.subtasks = []; // 确保 subtasks 是数组
            }
            return event;
        });

    } catch (err) {
        console.error('加载数据失败:', err);
        showToast('⚠️ 无法连接到服务器，请检查后端是否运行', 'error');
        events = [];
    } finally {
        hideLoading();
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 日历导航
    prevMonthBtn.addEventListener('click', goToPrevMonth);
    nextMonthBtn.addEventListener('click', goToNextMonth);
    todayBtn.addEventListener('click', goToToday);
    
    // 模态框
    emptyAddBtn.addEventListener('click', openAddEventModal);
    addEventBtn.addEventListener('click', openAddEventModal);
    closeModal.addEventListener('click', closeEventModal);
    cancelEventBtn.addEventListener('click', closeEventModal);
    
    // 表单提交
    eventForm.addEventListener('submit', handleEventFormSubmit);
    
    // 筛选按钮 — 事件委托
    const filterContainer = document.getElementById('filter-buttons-container');
    if (filterContainer) {
        filterContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-btn');
            if (!btn) return;
            filterContainer.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.remove('active', 'bg-primary/10', 'text-primary');
                b.classList.add('bg-gray-100', 'text-gray-600');
            });
            btn.classList.add('active', 'bg-primary/10', 'text-primary');
            btn.classList.remove('bg-gray-100', 'text-gray-600');
            const filter = btn.getAttribute('data-filter') || btn.textContent.trim();
            store.currentFilter = filter;
            renderEventList(filter);
        });
    }
    
    // 视图切换
    dayViewBtn.addEventListener('click', () => switchView('day'));
    weekViewBtn.addEventListener('click', () => switchView('week'));
    monthViewBtn.addEventListener('click', () => switchView('month'));
    
    // 数据导入导出
    importDataBtn.addEventListener('click', openImportModal);
    exportDataBtn.addEventListener('click', exportEventsData);
    closeImportModal.addEventListener('click', closeImportModalHandler);
    cancelImport.addEventListener('click', closeImportModalHandler);
    confirmImport.addEventListener('click', importEventsData);
    jsonFileInput.addEventListener('change', handleFileSelect);
    
    // 子任务相关
    if (addSubtaskBtn) {
        addSubtaskBtn.addEventListener('click', addSubtaskInput);
    }
}

// 渲染日历
function renderCalendar() {
    if (!calendarGrid) return;
    
    calendarGrid.innerHTML = '';
    
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    currentMonthElement.textContent = `${currentYear}年${monthNames[currentMonth]}`;
    
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const firstDayIndex = firstDay.getDay();
    const prevLastDay = new Date(currentYear, currentMonth, 0);
    const prevDaysCount = firstDayIndex;
    const daysInMonth = lastDay.getDate();
    
    for (let i = prevDaysCount; i > 0; i--) {
        const day = prevLastDay.getDate() - i + 1;
        const date = new Date(currentYear, currentMonth - 1, day);
        const dayElement = createCalendarDay(day, date, true);
        calendarGrid.appendChild(dayElement);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(currentYear, currentMonth, i);
        const dayElement = createCalendarDay(i, date, false);
        calendarGrid.appendChild(dayElement);
    }
    
    const nextDaysCount = 42 - (prevDaysCount + daysInMonth);
    for (let i = 1; i <= nextDaysCount; i++) {
        const date = new Date(currentYear, currentMonth + 1, i);
        const dayElement = createCalendarDay(i, date, true);
        calendarGrid.appendChild(dayElement);
    }
}

function createCalendarDay(day, date, isOtherMonth) {
    const dayElement = document.createElement('div');
    dayElement.className = `calendar-day rounded-lg p-2 flex flex-col items-center justify-start cursor-pointer transition-all duration-200 hover:bg-gray-100 ${isOtherMonth ? 'text-gray-400' : 'text-dark'}`;
    
    const isToday = date.toDateString() === new Date().toDateString();
    if (isToday) {
        dayElement.classList.add('bg-primary/10', 'font-medium');
    }
    
    const isSelected = date.toDateString() === selectedDate.toDateString();
    if (isSelected) {
        dayElement.classList.add('calendar-day-active', 'font-medium');
    }
    
    const dayNumber = document.createElement('span');
    dayNumber.className = 'text-sm';
    dayNumber.textContent = day;
    dayElement.appendChild(dayNumber);
    
    const dayEvents = events.filter(event => {
        return event.date === formatDate(date);
    });
    
    if (dayEvents.length > 0) {
        const eventIndicator = document.createElement('div');
        eventIndicator.className = 'flex flex-wrap justify-center mt-1 gap-0.5';
        
        const categories = [...new Set(dayEvents.map(event => event.category))];
        categories.forEach(category => {
            const dot = document.createElement('div');
            dot.className = `${lightCategoryColors[category]} w-1.5 h-1.5 rounded-full`;
            eventIndicator.appendChild(dot);
        });
        
        dayElement.appendChild(eventIndicator);
    }
    
    dayElement.addEventListener('click', () => {
        document.querySelectorAll('.calendar-day-active').forEach(el => {
            el.classList.remove('calendar-day-active');
        });
        
        dayElement.classList.add('calendar-day-active');
        selectedDate = new Date(date);
        
        updateSelectedDateInfo();
        renderEventList();
        updateEventStats();
        updateProgressStats();
        
        if (currentView !== 'day') {
            switchView('day');
        }
    });
    
    return dayElement;
}

function updateSelectedDateInfo() {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;
    const date = selectedDate.getDate();
    const dayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const dayOfWeek = dayNames[selectedDate.getDay()];
    
    selectedDateElement.textContent = `${year}年${month}月${date}日`;
    dayOfWeekElement.textContent = dayOfWeek;
}

function renderEventList(filterCategory = '全部') {
    if (!eventList) return;
    
    eventList.innerHTML = '';
    const selectedDateString = formatDate(selectedDate);
    const selectedEvents = events.filter(event => event.date === selectedDateString);
    
    let filteredEvents = selectedEvents;
    if (filterCategory !== '全部') {
        filteredEvents = selectedEvents.filter(event => event.category === filterCategory);
    }
    
    if (filteredEvents.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    filteredEvents.sort((a, b) => {
        return new Date(`2000-01-01T${a.time}`) - new Date(`2000-01-01T${b.time}`);
    });
    
    filteredEvents.forEach(event => {
        const eventElement = document.createElement('div');
        eventElement.className = `flex items-start p-4 rounded-xl border border-gray-100 hover:shadow-md transition-all duration-300 ${!!event.completed ? 'bg-gray-50' : 'bg-white'}`;
        
        const colorBar = document.createElement('div');
        colorBar.className = `${lightCategoryColors[event.category]} w-1.5 h-full rounded-l-lg mr-3`;
        eventElement.appendChild(colorBar);
        
        const contentContainer = document.createElement('div');
        contentContainer.className = 'flex-grow';
        
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between mb-1';
        
        const titleContainer = document.createElement('div');
        titleContainer.className = 'flex items-center';
        
        // 主复选框 - 使用 !!event.completed 统一处理布尔值，并添加 data-event-id 用于禁用控制
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'w-4 h-4 text-primary focus:ring-primary/50 border-gray-300 rounded mr-2 event-main-checkbox';
        checkbox.dataset.eventId = event.id;
        checkbox.checked = !!event.completed;  // 统一转换为布尔值
        checkbox.disabled = false;
        checkbox.addEventListener('change', () => toggleEventCompletion(event.id));
        titleContainer.appendChild(checkbox);
        
        const title = document.createElement('h4');
        title.className = `font-medium ${!!event.completed ? 'line-through text-gray-400' : 'text-dark'}`;
        title.textContent = event.title;
        titleContainer.appendChild(title);
        
        header.appendChild(titleContainer);
        contentContainer.appendChild(header);

        const category = document.createElement('span');
        category.className = `inline-block text-xs font-medium ${textCategoryColors[event.category]} ${lightCategoryColors[event.category]} px-2 py-0.5 rounded-full`;
        category.textContent = event.category;
        contentContainer.appendChild(category);

        // 重复周期徽标
        if (event.recurrence) {
            const recLabel = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[event.recurrence] || event.recurrence;
            const recBadge = document.createElement('span');
            recBadge.className = 'inline-block text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full ml-1.5';
            recBadge.textContent = '🔄 ' + recLabel;
            contentContainer.appendChild(recBadge);
        }

        if (event.description) {
            const description = document.createElement('p');
            description.className = `text-sm text-gray-600 mt-2 ${!!event.completed ? 'line-through text-gray-400' : ''}`;
            description.textContent = event.description;
            contentContainer.appendChild(description);
        }

        // 子任务显示
        if (event.subtasks && event.subtasks.length > 0) {
            const subtaskContainer = document.createElement('div');
            subtaskContainer.className = 'mt-3 pt-3 border-t border-gray-100';
            
            const completedSubtasks = event.subtasks.filter(st => !!st.completed).length;
            const totalSubtasks = event.subtasks.length;
            const progressPercentage = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
            
            const progressText = document.createElement('div');
            progressText.className = 'flex justify-between items-center mb-2';
            progressText.innerHTML = `
                <span class="text-xs text-gray-500">子任务进度</span>
                <span class="text-xs font-medium ${progressPercentage === 100 ? 'text-success' : 'text-warning'}">
                    ${completedSubtasks}/${totalSubtasks} (${progressPercentage}%)
                </span>
            `;
            subtaskContainer.appendChild(progressText);
            
            const progressBar = document.createElement('div');
            progressBar.className = 'w-full bg-gray-200 rounded-full h-1.5 mb-3';
            const progressFill = document.createElement('div');
            progressFill.className = `h-1.5 rounded-full ${progressPercentage === 100 ? 'bg-success' : 'bg-primary'}`;
            progressFill.style.width = `${progressPercentage}%`;
            progressBar.appendChild(progressFill);
            subtaskContainer.appendChild(progressBar);
            
            const subtaskList = document.createElement('div');
            subtaskList.className = 'space-y-1.5';
            
            event.subtasks.forEach((subtask, index) => {
                const subtaskItem = document.createElement('div');
                subtaskItem.className = 'flex items-center';
                
                // 子任务复选框 - 同样使用 !! 统一处理
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'w-3.5 h-3.5 text-primary focus:ring-primary/50 border-gray-300 rounded mr-2 subtask-checkbox';
                checkbox.dataset.eventId = event.id;
                checkbox.dataset.subtaskIndex = index;
                checkbox.checked = !!subtask.completed;  // 统一转换为布尔值
                checkbox.disabled = false;
                checkbox.addEventListener('change', () => {
                    toggleSubtaskCompletion(event.id, index);
                });
                
                const label = document.createElement('label');
                label.className = `text-xs ${!!subtask.completed ? 'line-through text-gray-400' : 'text-gray-600'}`;
                label.textContent = subtask.title;
                label.style.cursor = 'pointer';
                label.addEventListener('click', () => {
                    if (!checkbox.disabled) {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change'));
                    }
                });
                
                subtaskItem.appendChild(checkbox);
                subtaskItem.appendChild(label);
                subtaskList.appendChild(subtaskItem);
            });
            
            subtaskContainer.appendChild(subtaskList);
            contentContainer.appendChild(subtaskContainer);
        }
        
        eventElement.appendChild(contentContainer);

        // 右侧：时间 + 编辑 + 删除 同一行
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'flex items-center gap-2 ml-3 flex-shrink-0';

        const time = document.createElement('span');
        time.className = `text-xs font-medium whitespace-nowrap ${!!event.completed ? 'text-gray-400' : 'text-gray-500'}`;
        time.textContent = formatTime24(event.time);
        actionsContainer.appendChild(time);

        const editButton = document.createElement('button');
        editButton.className = 'p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-full transition-colors';
        editButton.innerHTML = '<i class="fa fa-pencil"></i>';
        editButton.addEventListener('click', () => openEditEventModal(event));
        actionsContainer.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.className = 'p-1.5 text-gray-400 hover:text-danger hover:bg-danger/5 rounded-full transition-colors';
        deleteButton.innerHTML = '<i class="fa fa-trash"></i>';
        deleteButton.addEventListener('click', () => deleteEvent(event.id));
        actionsContainer.appendChild(deleteButton);

        eventElement.appendChild(actionsContainer);
        
        eventList.appendChild(eventElement);
    });
}

// 新增：切换子任务完成状态（带乐观更新和回滚）
async function toggleSubtaskCompletion(eventId, subtaskIndex) {
    const event = events.find(e => e.id === eventId);
    if (!event || !event.subtasks || !event.subtasks[subtaskIndex]) return;
    
    const subtask = event.subtasks[subtaskIndex];
    const originalCompleted = !!subtask.completed;
    
    // 1. 乐观更新：立即修改本地内存
    subtask.completed = !originalCompleted;
    
    // 2. 检查是否所有子任务都完成了，如果是则自动完成主任务
    const allCompleted = event.subtasks.every(st => !!st.completed);
    event.completed = allCompleted;
    
    // 3. 立即重新渲染
    refreshAll();// 4. 禁用相关复选框
    const checkboxes = document.querySelectorAll(`input[data-event-id="${eventId}"]`);
    checkboxes.forEach(cb => cb.disabled = true);
    
    try {
        // 5. 发送 fetch 保存整个事件（包括子任务）
        const res = await fetch(`${API_BASE}/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: event.title,
                date: event.date,
                time: event.time,
                category: event.category,
                description: event.description,
                completed: event.completed,
                reminder: event.reminder,
                subtasks: event.subtasks
            })
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const updatedEvent = await res.json();
        
        // 6. 使用后端返回的数据更新本地（使用 !! 统一转换）
        const idx = events.findIndex(ev => ev.id === eventId);
        if (idx !== -1) {
            events[idx] = {
                ...updatedEvent,
                completed: !!updatedEvent.completed,
                subtasks: updatedEvent.subtasks ? updatedEvent.subtasks.map(st => ({
                    ...st,
                    completed: !!st.completed
                })) : []
            };
        }
        
        // 再次渲染确保同步
        renderEventList();
        updateEventStats();
        updateProgressStats();
        
    } catch (err) {
        console.error('更新子任务失败:', err);
        showToast('❌ 更新失败，请重试', 'error');
        
        // 7. 回滚：恢复原始状态
        subtask.completed = originalCompleted;
        const allCompletedOriginal = event.subtasks.every(st => !!st.completed);
        event.completed = allCompletedOriginal;
        
        // 重新渲染回滚后的状态
    refreshAll();} finally {
        // 8. 恢复复选框可用状态
        checkboxes.forEach(cb => cb.disabled = false);
    }
}

function renderWeekView() {
    if (!weekGrid) return;
    
    weekGrid.innerHTML = '';
    const firstDayOfWeek = new Date(selectedDate);
    firstDayOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
    
    for (let i = 0; i < 7; i++) {
        const day = new Date(firstDayOfWeek);
        day.setDate(firstDayOfWeek.getDate() + i);
        
        const dayElement = document.createElement('div');
        dayElement.className = 'week-day-cell';
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'flex items-center justify-between mb-1';
        
        const dateNumber = document.createElement('span');
        dateNumber.className = `text-sm font-medium ${day.toDateString() === selectedDate.toDateString() ? 'text-primary font-bold' : ''}`;
        dateNumber.textContent = day.getDate();
        dateHeader.appendChild(dateNumber);
        
        const dayName = document.createElement('span');
        dayName.className = 'text-xs text-gray-500';
        const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        dayName.textContent = dayNames[day.getDay()];
        dateHeader.appendChild(dayName);
        
        dayElement.appendChild(dateHeader);
        
        const dayEvents = events.filter(event => {
            return event.date === formatDate(day);
        });
        
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'flex-grow overflow-y-auto scrollbar-hide';
        
        if (dayEvents.length > 0) {
            dayEvents.sort((a, b) => {
                return new Date(`2000-01-01T${a.time}`) - new Date(`2000-01-01T${b.time}`);
            });
            
            const eventsToShow = dayEvents.slice(0, 6);
            const remainingEvents = dayEvents.length - eventsToShow.length;
            
            eventsToShow.forEach(event => {
                const eventItem = document.createElement('div');
                eventItem.className = `compact-event ${lightCategoryColors[event.category]} cursor-pointer hover:shadow-md transition-all duration-200`;
                eventItem.title = `${formatTime24(event.time)} - ${event.title}`;
                
                if (event.subtasks && event.subtasks.length > 0) {
                    const completed = event.subtasks.filter(st => !!st.completed).length;
                    const total = event.subtasks.length;
                    eventItem.title += ` (${completed}/${total})`;
                }
                
                const titleSpan = document.createElement('span');
                titleSpan.className = 'truncate';
                titleSpan.textContent = event.title;
                eventItem.appendChild(titleSpan);
                
                eventItem.addEventListener('click', () => {
                    selectedDate = day;
                    renderCalendar();
                    updateSelectedDateInfo();
                    renderEventList();
                    updateEventStats();
                    updateProgressStats();
                    switchView('day');
                });
                
                eventsContainer.appendChild(eventItem);
            });
            
            if (remainingEvents > 0) {
                const remainingCount = document.createElement('div');
                remainingCount.className = 'text-[10px] text-primary cursor-pointer mt-0.5';
                remainingCount.textContent = `+${remainingEvents} 更多`;
                remainingCount.addEventListener('click', () => {
                    selectedDate = day;
                    renderCalendar();
                    updateSelectedDateInfo();
                    renderEventList();
                    updateEventStats();
                    updateProgressStats();
                    switchView('day');
                });
                eventsContainer.appendChild(remainingCount);
            }
        } else {
            const noEvents = document.createElement('div');
            noEvents.className = 'text-[10px] text-gray-400 italic flex-grow flex items-center justify-center';
            noEvents.textContent = '无日程';
            eventsContainer.appendChild(noEvents);
        }
        
        dayElement.appendChild(eventsContainer);
        weekGrid.appendChild(dayElement);
    }
    
    renderWeekCategorySummary();
}

function renderMonthView() {
    if (!monthGrid) return;
    
    monthGrid.innerHTML = '';
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const firstDayIndex = firstDay.getDay();
    const prevLastDay = new Date(currentYear, currentMonth, 0);
    const prevDaysCount = firstDayIndex;
    const daysInMonth = lastDay.getDate();
    
    for (let i = prevDaysCount; i > 0; i--) {
        const day = prevLastDay.getDate() - i + 1;
        const date = new Date(currentYear, currentMonth - 1, day);
        const dayElement = createMonthViewDay(day, date, true);
        monthGrid.appendChild(dayElement);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(currentYear, currentMonth, i);
        const dayElement = createMonthViewDay(i, date, false);
        monthGrid.appendChild(dayElement);
    }
    
    const nextDaysCount = 42 - (prevDaysCount + daysInMonth);
    for (let i = 1; i <= nextDaysCount; i++) {
        const date = new Date(currentYear, currentMonth + 1, i);
        const dayElement = createMonthViewDay(i, date, true);
        monthGrid.appendChild(dayElement);
    }
    
    renderMonthCategorySummary();
}

function createMonthViewDay(day, date, isOtherMonth) {
    const dayElement = document.createElement('div');
    dayElement.className = `month-day-cell ${isOtherMonth ? 'text-gray-400' : 'text-dark'}`;
    
    const dateHeader = document.createElement('div');
    dateHeader.className = 'flex items-center justify-between mb-1';
    
    const dateNumber = document.createElement('span');
    dateNumber.className = `text-xs font-medium ${date.toDateString() === selectedDate.toDateString() ? 'text-primary font-bold' : ''}`;
    dateNumber.textContent = day;
    dateHeader.appendChild(dateNumber);
    
    const dayName = document.createElement('span');
    dayName.className = 'text-[10px] text-gray-500';
    const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
    dayName.textContent = dayNames[date.getDay()];
    dateHeader.appendChild(dayName);
    
    dayElement.appendChild(dateHeader);
    
    const dayEvents = events.filter(event => {
        return event.date === formatDate(date);
    });
    
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'flex-grow overflow-y-auto scrollbar-hide';
    
    if (dayEvents.length > 0) {
        dayEvents.sort((a, b) => {
            return new Date(`2000-01-01T${a.time}`) - new Date(`2000-01-01T${b.time}`);
        });
        
        const eventsToShow = dayEvents.slice(0, 5);
        const remainingEvents = dayEvents.length - eventsToShow.length;
        
        eventsToShow.forEach(event => {
            const eventItem = document.createElement('div');
            eventItem.className = `compact-event ${lightCategoryColors[event.category]} cursor-pointer hover:shadow-md transition-all duration-200`;
            
            let eventTitle = event.title;
            if (event.subtasks && event.subtasks.length > 0) {
                const completed = event.subtasks.filter(st => !!st.completed).length;
                const total = event.subtasks.length;
                eventTitle = `[${completed}/${total}] ${event.title}`;
            }
            
            eventItem.title = `${formatTime24(event.time)} - ${event.title}`;
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'truncate';
            titleSpan.textContent = eventTitle;
            eventItem.appendChild(titleSpan);
            
            eventItem.addEventListener('click', () => {
                selectedDate = date;
                renderCalendar();
                updateSelectedDateInfo();
                renderEventList();
                updateEventStats();
                updateProgressStats();
                switchView('day');
            });
            
            eventsContainer.appendChild(eventItem);
        });
        
        if (remainingEvents > 0) {
            const remainingCount = document.createElement('div');
            remainingCount.className = 'text-[10px] text-primary cursor-pointer mt-0.5';
            remainingCount.textContent = `+${remainingEvents} 更多`;
            remainingCount.addEventListener('click', () => {
                selectedDate = date;
                renderCalendar();
                updateSelectedDateInfo();
                renderEventList();
                updateEventStats();
                updateProgressStats();
                switchView('day');
            });
            eventsContainer.appendChild(remainingCount);
        }
    } else {
        const noEvents = document.createElement('div');
        noEvents.className = 'text-[10px] text-gray-400 italic flex-grow flex items-center justify-center';
        noEvents.textContent = '无日程';
        eventsContainer.appendChild(noEvents);
    }
    
    dayElement.appendChild(eventsContainer);
    
    dayElement.addEventListener('click', () => {
        selectedDate = new Date(date);
        updateSelectedDateInfo();
        renderEventList();
        updateEventStats();
        updateProgressStats();
        
        if (currentView === 'month') {
            switchView('day');
        }
        
        renderCalendar();
    });
    
    return dayElement;
}

// 修改：renderUpcomingEvents - 只显示未完成且日期>=今天的事件
function renderUpcomingEvents() {
    if (!upcomingEvents) return;
    
    upcomingEvents.innerHTML = '';
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const currentTimeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const upcoming = events.filter(event => {
        if (!!event.completed) return false;
        
        const eventDate = new Date(event.date + 'T00:00:00');
        eventDate.setHours(0, 0, 0, 0);
        const todayStart = new Date(today);
        
        if (eventDate < todayStart) return false;
        
        if (eventDate.getTime() === todayStart.getTime()) {
            if (event.time < currentTimeString) {
                return false;
            }
        }
        
        return eventDate <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    }).sort((a, b) => {
        return new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time);
    }).slice(0, 5);
    
    if (upcoming.length === 0) {
        upcomingEvents.innerHTML = '<p class="text-sm text-gray-500 italic">没有即将到来的日程</p>';
        return;
    }
    
    upcoming.forEach(event => {
        const eventDate = new Date(event.date + 'T00:00:00');
        const todayStart = new Date(today);
        const diffDays = Math.floor((eventDate - todayStart) / (1000 * 60 * 60 * 24));
        
        let dateDisplay = '';
        if (diffDays === 0) {
            dateDisplay = '今天 ' + formatTime24(event.time);
        } else if (diffDays === 1) {
            dateDisplay = '明天';
        } else if (diffDays === 2) {
            dateDisplay = '后天';
        } else {
            dateDisplay = `${diffDays}天后`;
        }
        
        const eventElement = document.createElement('div');
        eventElement.className = `flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors`;
        
        const leftInfo = document.createElement('div');
        leftInfo.className = 'flex items-center';
        
        const timeElement = document.createElement('div');
        timeElement.className = `text-xs font-medium ${textCategoryColors[event.category]} bg-white border ${lightCategoryColors[event.category].replace('light-', 'border-')} rounded-md py-0.5 px-1.5 mr-3`;
        timeElement.textContent = formatTime24(event.time);
        leftInfo.appendChild(timeElement);
        
        const titleElement = document.createElement('span');
        titleElement.className = 'text-sm text-gray-700 truncate max-w-[140px]';
        
        let titleText = event.title;
        if (event.subtasks && event.subtasks.length > 0) {
            const completed = event.subtasks.filter(st => !!st.completed).length;
            const total = event.subtasks.length;
            titleText = `[${completed}/${total}] ${event.title}`;
        }
        
        titleElement.textContent = titleText;
        leftInfo.appendChild(titleElement);
        
        eventElement.appendChild(leftInfo);
        
        const dateElement = document.createElement('span');
        dateElement.className = `text-xs font-medium ${textCategoryColors[event.category]} bg-white border ${lightCategoryColors[event.category].replace('light-', 'border-')} rounded-md py-0.5 px-1.5`;
        dateElement.textContent = dateDisplay;
        eventElement.appendChild(dateElement);
        
        upcomingEvents.appendChild(eventElement);
    });
}

// 修改：更新事件统计（基于任务数量）
function updateEventStats() {
    const selectedDateString = formatDate(selectedDate);
    const selectedEvents = events.filter(event => event.date === selectedDateString);
    
    const total = selectedEvents.length;
    const completed = selectedEvents.filter(event => !!event.completed).length;
    const pending = total - completed;
    
    const completionData = calculateOverallCompletion(selectedEvents);
    
    if (totalEventsElement) totalEventsElement.textContent = total;
    if (completedEventsElement) completedEventsElement.textContent = completed;
    if (pendingEventsElement) pendingEventsElement.textContent = pending;
    
    updateTaskPointStats(completionData.completedPoints, completionData.totalPoints);
}

// 修改：更新进度统计（基于任务点）
function updateProgressStats() {
    let title, subtitle;
    const circumference = 2 * Math.PI * 45;
    
    switch (currentView) {
        case 'day':
            const selectedDateString = formatDate(selectedDate);
            const dayEvents = events.filter(event => event.date === selectedDateString);
            const dayCompletion = calculateOverallCompletion(dayEvents);
            
            title = "今日完成度";
            subtitle = `完成率：${dayCompletion.completedPoints}/${dayCompletion.totalPoints}个任务点`;
            if (progressText) progressText.textContent = `${dayCompletion.percentage}%`;
            
            const dayOffset = circumference - (dayCompletion.percentage / 100 * circumference);
            if (progressCircle) {
                progressCircle.style.strokeDasharray = circumference;
                progressCircle.style.strokeDashoffset = dayOffset;
            }
            break;
            
        case 'week':
            const firstDayOfWeek = new Date(selectedDate);
            firstDayOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
            
            const lastDayOfWeek = new Date(firstDayOfWeek);
            lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
            
            const weekEvents = events.filter(event => {
                const eventDate = new Date(event.date + 'T00:00:00');
                return eventDate >= firstDayOfWeek && eventDate <= lastDayOfWeek;
            });
            
            const weekCompletion = calculateOverallCompletion(weekEvents);
            
            title = "本周完成度";
            subtitle = `完成率：${weekCompletion.completedPoints}/${weekCompletion.totalPoints}个任务点`;
            if (progressText) progressText.textContent = `${weekCompletion.percentage}%`;
            
            const weekOffset = circumference - (weekCompletion.percentage / 100 * circumference);
            if (progressCircle) {
                progressCircle.style.strokeDasharray = circumference;
                progressCircle.style.strokeDashoffset = weekOffset;
            }
            break;
            
        case 'month':
            const monthEvents = events.filter(event => {
                const eventDate = new Date(event.date + 'T00:00:00');
                return eventDate.getMonth() === selectedDate.getMonth() &&
                        eventDate.getFullYear() === selectedDate.getFullYear();
            });
            
            const monthCompletion = calculateOverallCompletion(monthEvents);
            
            title = "本月完成度";
            subtitle = `完成率：${monthCompletion.completedPoints}/${monthCompletion.totalPoints}个任务点`;
            if (progressText) progressText.textContent = `${monthCompletion.percentage}%`;
            
            const monthOffset = circumference - (monthCompletion.percentage / 100 * circumference);
            if (progressCircle) {
                progressCircle.style.strokeDasharray = circumference;
                progressCircle.style.strokeDashoffset = monthOffset;
            }
            break;
    }
    
    if (progressTitle) progressTitle.textContent = title;
    if (progressSubtitle) progressSubtitle.textContent = subtitle;
}

// 子任务功能
function addSubtaskInput(subtask = { id: Date.now() + Math.random(), title: '', completed: false }) {
    const subtaskItem = document.createElement('div');
    subtaskItem.className = 'subtask-edit-item';
    subtaskItem.dataset.id = subtask.id;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'w-4 h-4 text-primary focus:ring-primary/50 border-gray-300 rounded';
    checkbox.checked = !!subtask.completed;  // 统一使用 !!
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'subtask-edit-input flex-grow';
    input.placeholder = '输入子任务内容';
    input.value = subtask.title || '';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'subtask-delete-btn';
    deleteBtn.innerHTML = '<i class="fa fa-trash text-xs"></i>';
    deleteBtn.addEventListener('click', () => {
        subtaskItem.remove();
    });
    
    subtaskItem.appendChild(checkbox);
    subtaskItem.appendChild(input);
    subtaskItem.appendChild(deleteBtn);
    
    subtasksContainer.appendChild(subtaskItem);
}

function openAddEventModal() {
    modalTitle.textContent = '添加日程';
    eventId.value = '';
    eventTitle.value = '';
    eventDate.value = formatDate(selectedDate);
    eventTime.value = '10:00';
    eventCategory.value = '工作';
    eventDescription.value = '';
    eventReminder.checked = false;
    eventRecurrence.value = '';
    eventRecurrenceEnd.value = '';
    recurrenceEndGroup.style.display = 'none';

    subtasksContainer.innerHTML = '';
    addSubtaskInput();
    openModal();
}

function openEditEventModal(event) {
    modalTitle.textContent = '编辑日程';
    eventId.value = event.id;
    eventTitle.value = event.title;
    eventDate.value = event.date;
    eventTime.value = event.time;
    eventCategory.value = event.category;
    eventDescription.value = event.description;
    eventReminder.checked = false;
    eventRecurrence.value = event.recurrence || '';
    eventRecurrenceEnd.value = event.recurrence_end_date || '';
    recurrenceEndGroup.style.display = event.recurrence ? '' : 'none';

    subtasksContainer.innerHTML = '';

    if (event.subtasks && event.subtasks.length > 0) {
        event.subtasks.forEach(subtask => {
            addSubtaskInput(subtask);
        });
    } else {
        addSubtaskInput();
    }

    openModal();
}

// 重复周期选择 → 显示/隐藏结束日期
eventRecurrence.addEventListener('change', function() {
    recurrenceEndGroup.style.display = this.value ? '' : 'none';
});

function openModal() {
    eventModal.classList.remove('hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeEventModal() {
    modalContent.classList.remove('scale-100', 'opacity-100');
    modalContent.classList.add('scale-95', 'opacity-0');
    
    setTimeout(() => {
        eventModal.classList.add('hidden');
    }, 300);
}

async function handleEventFormSubmit(e) {
    e.preventDefault();
    
    const id = eventId.value ? parseInt(eventId.value) : null;
    const title = eventTitle.value.trim();
    const date = eventDate.value;
    const time = eventTime.value;
    const category = eventCategory.value;
    const description = eventDescription.value.trim();
    const reminder = eventReminder.checked;
    
    if (!title) {
        alert('请输入日程标题');
        return;
    }
    
    const subtaskElements = subtasksContainer.querySelectorAll('.subtask-edit-item');
    const subtasks = [];
    
    subtaskElements.forEach(element => {
        const checkbox = element.querySelector('input[type="checkbox"]');
        const input = element.querySelector('input[type="text"]');
        
        if (input.value.trim()) {
            subtasks.push({
                id: parseInt(element.dataset.id) || Date.now() + Math.random(),
                title: input.value.trim(),
                completed: !!checkbox.checked  // 统一使用 !!
            });
        }
    });

    const recurrence = eventRecurrence.value || null;
    const recurrence_end_date = recurrence ? (eventRecurrenceEnd.value || null) : null;

    const payload = { title, date, time, category, description, reminder, subtasks,
        recurrence, recurrence_end_date,
        completed: subtasks.length > 0 ? subtasks.every(st => !!st.completed) : false };

    showLoading(id ? '正在保存...' : '正在添加...');
    try {
        let res, updatedEvent;
        if (id) {
            res = await fetch(`${API_BASE}/events/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        updatedEvent = await res.json();

        // 使用 !! 统一转换为布尔值
        updatedEvent.completed = !!updatedEvent.completed;
        if (updatedEvent.subtasks) {
            updatedEvent.subtasks = updatedEvent.subtasks.map(st => ({
                ...st,
                completed: !!st.completed
            }));
        }

        if (id) {
            const idx = events.findIndex(ev => ev.id === id);
            if (idx !== -1) events[idx] = updatedEvent;
        } else {
            events.push(updatedEvent);
        }
        showToast(id ? '✅ 日程已更新' : '✅ 日程已添加');
    } catch (err) {
        console.error('保存失败:', err);
        showToast('❌ 保存失败，请重试', 'error');
        return;
    } finally {
        hideLoading();
    }
    
    // 重置筛选器为"全部"
    const container = document.getElementById('filter-buttons-container');
    if (container) {
        container.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('active', 'bg-primary/10', 'text-primary');
            b.classList.add('bg-gray-100', 'text-gray-600');
        });
        const allBtn = container.querySelector('[data-filter="全部"]');
        if (allBtn) { allBtn.classList.add('active', 'bg-primary/10', 'text-primary'); allBtn.classList.remove('bg-gray-100', 'text-gray-600'); }
    }
    
    closeEventModal();
    renderEventList('全部');
    renderCalendar();
    renderWeekView();
    renderMonthView();
    renderUpcomingEvents();
    updateEventStats();
    updateProgressStats();
}

async function deleteEvent(id) {
    if (confirm('确定要删除这个日程吗？')) {
        showLoading('正在删除...');
        try {
            const res = await fetch(`${API_BASE}/events/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            events = events.filter(event => event.id !== id);
            showToast('🗑️ 日程已删除');
        } catch (err) {
            console.error('删除失败:', err);
            showToast('❌ 删除失败，请重试', 'error');
            return;
        } finally {
            hideLoading();
        }
        renderEventList();
        renderCalendar();
        renderWeekView();
        renderMonthView();
        renderUpcomingEvents();
        updateEventStats();
        updateProgressStats();
    }
}

// ===== 修改：切换事件完成状态（乐观更新 + 回滚）=====
async function toggleEventCompletion(id) {
    const event = events.find(e => e.id === id);
    if (!event) return;
    
    // 保存原始状态用于回滚
    const originalCompleted = !!event.completed;
    const originalSubtasksCompleted = event.subtasks ? event.subtasks.map(st => !!st.completed) : [];
    
    // 1. 乐观更新：立即修改本地内存
    const newCompleted = !originalCompleted;
    event.completed = newCompleted;
    
    // 如果有子任务，根据主任务状态同步所有子任务
    if (event.subtasks && event.subtasks.length > 0) {
        event.subtasks.forEach(st => {
            st.completed = newCompleted;
        });
    }
    
    // 2. 立即重新渲染UI（不等待API）
    renderEventList();
    renderCalendar();
    updateEventStats();
    updateProgressStats();
    renderWeekView();
    renderMonthView();
    renderUpcomingEvents();
    
    // 3. 禁用该事件的所有复选框，防止重复点击
    const checkboxes = document.querySelectorAll(`input[data-event-id="${id}"]`);
    checkboxes.forEach(cb => cb.disabled = true);
    
    try {
        // 4. 发送 fetch 请求
        const res = await fetch(`${API_BASE}/events/${id}/toggle`, { method: 'PATCH' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        let updatedEvent = await res.json();
        
        // 5. 使用后端返回的数据更新本地（使用 !! 统一转换）
        updatedEvent.completed = !!updatedEvent.completed;
        if (updatedEvent.subtasks) {
            updatedEvent.subtasks = updatedEvent.subtasks.map(st => ({
                ...st,
                completed: !!st.completed
            }));
        }
        
        // 更新本地数据为服务器确认的数据
        const idx = events.findIndex(ev => ev.id === id);
        if (idx !== -1) events[idx] = updatedEvent;
        
        // 再次渲染以确保与服务器同步
        renderEventList();
        renderCalendar();
        updateEventStats();
        updateProgressStats();
        renderWeekView();
        renderMonthView();
        renderUpcomingEvents();
        
    } catch (err) {
        console.error('切换状态失败:', err);
        showToast('❌ 操作失败，已恢复之前状态', 'error');
        
        // 6. 回滚：恢复原始状态
        event.completed = originalCompleted;
        if (event.subtasks && event.subtasks.length > 0) {
            event.subtasks.forEach((st, idx) => {
                st.completed = originalSubtasksCompleted[idx];
            });
        }
        
        // 重新渲染回滚后的状态
        renderEventList();
        renderCalendar();
        updateEventStats();
        updateProgressStats();
        renderWeekView();
        renderMonthView();
        renderUpcomingEvents();
    } finally {
        // 7. 恢复复选框可用状态
        checkboxes.forEach(cb => cb.disabled = false);
    }
}

function goToPrevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    renderCalendar();
    renderMonthView();
    updateProgressStats();
}

function goToNextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar();
    renderMonthView();
    updateProgressStats();
}

function goToToday() {
    currentDate = new Date();
    currentMonth = currentDate.getMonth();
    currentYear = currentDate.getFullYear();
    selectedDate = new Date(currentDate);
    renderCalendar();
    renderMonthView();
    updateSelectedDateInfo();
    renderEventList();
    updateEventStats();
    updateProgressStats();
    switchView('day');
}

function switchView(view) {
    currentView = view;
    
    dayViewBtn.classList.toggle('active', view === 'day');
    weekViewBtn.classList.toggle('active', view === 'week');
    monthViewBtn.classList.toggle('active', view === 'month');
    
    dayView.classList.toggle('hidden', view !== 'day');
    weekView.classList.toggle('hidden', view !== 'week');
    monthView.classList.toggle('hidden', view !== 'month');
    
    updateProgressStats();
    
    if (view === 'week' || view === 'month') {
        currentMonth = selectedDate.getMonth();
        currentYear = selectedDate.getFullYear();
        renderCalendar();
        if (view === 'month') {
            renderMonthView();
        } else {
            renderWeekView();
        }
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatTime24(time) {
    return time.substring(0, 5);
}

// localStorage 已由后端 API 替代，保留空函数避免兼容性报错
function saveEventsToLocalStorage() { /* 已由 API 替代 */ }
function loadEventsFromLocalStorage() { /* 已由 API 替代，启动时调用 loadEventsFromAPI() */ }

function openImportModal() {
    importModal.classList.remove('hidden');
    setTimeout(() => {
        importModal.querySelector('.bg-white').classList.remove('scale-95', 'opacity-0');
        importModal.querySelector('.bg-white').classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeImportModalHandler() {
    importModal.querySelector('.bg-white').classList.remove('scale-100', 'opacity-100');
    importModal.querySelector('.bg-white').classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        importModal.classList.add('hidden');
        jsonDataTextarea.value = '';
        jsonFileInput.value = '';
    }, 300);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const jsonData = JSON.parse(event.target.result);
            jsonDataTextarea.value = JSON.stringify(jsonData, null, 2);
        } catch (error) {
            alert('无法解析JSON文件: ' + error.message);
        }
    };
    reader.readAsText(file);
}

async function importEventsData() {
    let jsonData;
    
    try {
        jsonData = JSON.parse(jsonDataTextarea.value);
    } catch (error) {
        alert('无法解析JSON数据: ' + error.message);
        return;
    }
    
    if (!Array.isArray(jsonData)) {
        alert('导入的数据格式不正确，必须是事件数组');
        return;
    }
    
    const isValid = jsonData.every(event => {
        return event.hasOwnProperty('title') &&
                event.hasOwnProperty('date') &&
                event.hasOwnProperty('time') &&
                event.hasOwnProperty('category');
    });
    
    if (!isValid) {
        alert('导入的数据格式不正确，每个事件必须包含标题、日期、时间和分类');
        return;
    }
    
    showLoading(`正在导入 ${jsonData.length} 条数据...`);
    let successCount = 0;
    try {
        for (const ev of jsonData) {
            const payload = {
                title: ev.title, date: ev.date, time: ev.time,
                category: ev.category || '其他', description: ev.description || '',
                completed: !!ev.completed, reminder: ev.reminder || false,  // 使用 !!
                subtasks: (ev.subtasks || []).map(st => ({
                    ...st,
                    completed: !!st.completed  // 使用 !!
                }))
            };
            const res = await fetch(`${API_BASE}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                let newEvent = await res.json();
                // 使用 !! 统一转换
                newEvent.completed = !!newEvent.completed;
                if (newEvent.subtasks) {
                    newEvent.subtasks = newEvent.subtasks.map(st => ({
                        ...st,
                        completed: !!st.completed
                    }));
                }
                events.push(newEvent);
                successCount++;
            }
        }
    } catch (err) {
        console.error('导入失败:', err);
    } finally {
        hideLoading();
    }
    
    closeImportModalHandler();
    refreshAll();showToast(`✅ 成功导入 ${successCount} 个日程`);
}

function exportEventsData() {
    // 导出时也确保是布尔值
    const exportData = events.map(ev => ({
        ...ev,
        completed: !!ev.completed,
        subtasks: (ev.subtasks || []).map(st => ({
            ...st,
            completed: !!st.completed
        }))
    }));
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `日程数据_${formatDate(new Date())}.json`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// ========== 分类汇总 ==========
function renderWeekCategorySummary() {
    const weekSummaryContainer = document.getElementById('week-category-summary');
    if (!weekSummaryContainer) return;
    
    const firstDayOfWeek = new Date(selectedDate);
    firstDayOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
    
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
    
    const weekEvents = events.filter(event => {
        const eventDate = new Date(event.date + 'T00:00:00');
        return eventDate >= firstDayOfWeek && eventDate <= lastDayOfWeek;
    });
    
    renderCategorySummary(weekEvents, weekSummaryContainer, 'week');
}

function renderMonthCategorySummary() {
    const monthSummaryContainer = document.getElementById('month-category-summary');
    if (!monthSummaryContainer) return;
    
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    
    const monthEvents = events.filter(event => {
        const eventDate = new Date(event.date + 'T00:00:00');
        return eventDate >= firstDayOfMonth && eventDate <= lastDayOfMonth;
    });
    
    renderCategorySummary(monthEvents, monthSummaryContainer, 'month');
}

function renderCategorySummary(eventsList, container, viewType) {
    container.innerHTML = '';

    // 动态收集所有类别
    const categories = {};
    eventsList.forEach(event => {
        const cat = event.category || '其他';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(event);
    });
    
    const categoryStats = {};
    Object.keys(categories).forEach(category => {
        const categoryEvents = categories[category];
        
        let categoryTotalPoints = 0;
        let categoryCompletedPoints = 0;
        
        categoryEvents.forEach(event => {
            const points = calculateTaskPointCompletion(event);
            categoryTotalPoints += points.totalPoints;
            categoryCompletedPoints += points.completedPoints;
        });
        
        const completionRate = categoryTotalPoints > 0 ? Math.round((categoryCompletedPoints / categoryTotalPoints) * 100) : 0;
        
        categoryStats[category] = {
            total: categoryEvents.length,
            completed: categoryEvents.filter(event => !!event.completed).length,
            totalPoints: categoryTotalPoints,
            completedPoints: categoryCompletedPoints,
            completionRate,
            events: categoryEvents
        };
    });
    
    Object.keys(categories).forEach(category => {
        const stats = categoryStats[category];
        const categoryCard = document.createElement('div');
        categoryCard.className = 'bg-white border border-gray-200 rounded-xl shadow-sm p-4 category-summary-card';
        
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between mb-3';
        
        const titleContainer = document.createElement('div');
        titleContainer.className = 'flex items-center';
        
        const dot = document.createElement('div');
        dot.className = `${lightCategoryColors[category]} w-3 h-3 rounded-full mr-2`;
        
        const title = document.createElement('h4');
        title.className = `font-semibold ${textCategoryColors[category]}`;
        title.textContent = category;
        
        titleContainer.appendChild(dot);
        titleContainer.appendChild(title);
        header.appendChild(titleContainer);
        
        const count = document.createElement('span');
        count.className = `text-sm font-medium ${textCategoryColors[category]} ${lightCategoryColors[category]} px-2 py-0.5 rounded-full`;
        count.textContent = stats.total;
        header.appendChild(count);
        
        categoryCard.appendChild(header);
        
        const progressContainer = document.createElement('div');
        progressContainer.className = 'mb-3';
        
        const progressInfo = document.createElement('div');
        progressInfo.className = 'flex justify-between text-xs text-gray-600 mb-1';
        progressInfo.innerHTML = `
            <span>完成率: ${stats.completionRate}%</span>
            <span>${stats.completedPoints}/${stats.totalPoints} 任务点</span>
        `;
        progressContainer.appendChild(progressInfo);
        
        const progressBar = document.createElement('div');
        progressBar.className = 'w-full bg-gray-200 rounded-full h-1.5';
        const progressFill = document.createElement('div');
        progressFill.className = `h-1.5 rounded-full ${stats.completionRate === 100 ? 'bg-success' : 'bg-primary'}`;
        progressFill.style.width = `${stats.completionRate}%`;
        progressBar.appendChild(progressFill);
        progressContainer.appendChild(progressBar);
        
        categoryCard.appendChild(progressContainer);
        
        const tasksContainer = document.createElement('div');
        tasksContainer.className = 'space-y-1 max-h-48 overflow-y-auto pr-1';
        
        if (stats.events.length > 0) {
            const sortedEvents = stats.events.sort((a, b) => {
                const dateCompare = new Date(a.date) - new Date(b.date);
                if (dateCompare !== 0) return dateCompare;
                return new Date(`2000-01-01T${a.time}`) - new Date(`2000-01-01T${b.time}`);
            });
            
            sortedEvents.forEach(event => {
                const taskItem = document.createElement('div');
                taskItem.className = 'summary-task-item';
                taskItem.addEventListener('click', () => {
                    selectedDate = new Date(event.date + 'T00:00:00');
                    renderCalendar();
                    updateSelectedDateInfo();
                    renderEventList();
                    updateEventStats();
                    updateProgressStats();
                    switchView('day');
                });
                
                const leftContent = document.createElement('div');
                leftContent.className = 'task-title-container';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'w-3.5 h-3.5 text-primary focus:ring-primary/50 border-gray-300 rounded mr-2 flex-shrink-0 summary-checkbox';
                checkbox.checked = !!event.completed;  // 使用 !! 统一转换
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleEventCompletion(event.id);
                    if (viewType === 'week') {
                        renderWeekCategorySummary();
                    } else {
                        renderMonthCategorySummary();
                    }
                });
                
                const titleContent = document.createElement('div');
                titleContent.className = 'flex items-center flex-grow min-w-0';
                
                const taskTitle = document.createElement('span');
                taskTitle.className = `task-title-main ${!!event.completed ? 'line-through text-gray-400' : 'text-gray-700'}`;  // 使用 !!
                taskTitle.textContent = event.title;
                taskTitle.title = event.title;
                
                titleContent.appendChild(taskTitle);
                
                if (event.subtasks && event.subtasks.length > 0) {
                    const completedSubtasks = event.subtasks.filter(st => !!st.completed).length;
                    const totalSubtasks = event.subtasks.length;
                    
                    const subtaskBadge = document.createElement('span');
                    subtaskBadge.className = 'subtask-count-badge';
                    subtaskBadge.textContent = `${completedSubtasks}/${totalSubtasks}`;
                    subtaskBadge.title = `${completedSubtasks}个完成，共${totalSubtasks}个子任务`;
                    
                    titleContent.appendChild(subtaskBadge);
                }
                
                leftContent.appendChild(checkbox);
                leftContent.appendChild(titleContent);
                
                const rightContent = document.createElement('div');
                
                const dateBadge = document.createElement('span');
                
                const eventDate = new Date(event.date + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const eventDateOnly = new Date(event.date + 'T00:00:00');
                eventDateOnly.setHours(0, 0, 0, 0);
                
                let dateText = '';
                let dateClass = 'task-date-badge';
                
                if (eventDateOnly.getTime() === today.getTime()) {
                    dateText = '今天';
                    dateClass += ' date-today';
                } else if (eventDateOnly.getTime() === today.getTime() + 86400000) {
                    dateText = '明天';
                    dateClass += ' date-tomorrow';
                } else if (eventDateOnly.getTime() === today.getTime() + 2 * 86400000) {
                    dateText = '后天';
                    dateClass += ' date-tomorrow';
                } else {
                    const firstDayOfWeek = new Date(today);
                    firstDayOfWeek.setDate(today.getDate() - today.getDay());
                    const lastDayOfWeek = new Date(firstDayOfWeek);
                    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
                    
                    if (eventDateOnly >= firstDayOfWeek && eventDateOnly <= lastDayOfWeek) {
                        const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
                        dateText = dayNames[eventDate.getDay()];
                        dateClass += ' date-this-week';
                    } else {
                        dateText = `${eventDate.getMonth() + 1}/${eventDate.getDate()}`;
                    }
                }
                
                dateBadge.className = dateClass;
                dateBadge.textContent = dateText;
                dateBadge.title = `${eventDate.getFullYear()}年${eventDate.getMonth() + 1}月${eventDate.getDate()}日`;
                
                rightContent.appendChild(dateBadge);
                
                taskItem.appendChild(leftContent);
                taskItem.appendChild(rightContent);
                
                tasksContainer.appendChild(taskItem);
            });
        } else {
            const emptyState = document.createElement('div');
            emptyState.className = 'text-center py-4 text-gray-400 italic text-xs';
            emptyState.textContent = `没有${viewType === 'week' ? '本周' : '本月'}${category}任务`;
            tasksContainer.appendChild(emptyState);
        }
        
        categoryCard.appendChild(tasksContainer);
        container.appendChild(categoryCard);
    });
}

// ========== AI聊天功能 ==========
let currentConfirmId = null;
let currentActionPreview = null;
let aiHistory = []; // 对话记忆

// 从服务端加载7天内的聊天历史（全局共享，PC/移动端自动同步）
async function loadChatHistory() {
  try {
    console.log('[Sync] 正在加载聊天历史...');
    const res = await fetch(`${API_BASE}/ai/history`);
    const data = await res.json();
    console.log('[Sync] 加载结果:', data.history ? data.history.length + '条' : '空');
    if (data.history && data.history.length > 0) {
      aiHistory = data.history.map(h => ({ role: h.role, message: h.message }));
      // 在聊天窗口中渲染历史记录
      aiChatMessages.innerHTML = '';
      aiHistory.forEach(h => addChatMessage(h.role, h.message, false));
    }
  } catch (e) {
    console.error('[Sync] 加载聊天历史失败:', e);
  }
}

// 保存一轮对话到服务端
async function saveChatHistory(userMsg, aiMsg) {
  console.log('[Sync] 正在保存聊天记录...');
  try {
    const res = await fetch(`${API_BASE}/ai/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', message: userMsg },
          { role: 'assistant', message: aiMsg }
        ]
      })
    });
    const result = await res.json();
    console.log('[Sync] 保存结果:', result);
  } catch (e) {
    console.error('[Sync] 保存聊天历史失败:', e);
  }
}

const aiChatToggle = document.getElementById('ai-chat-toggle');
const aiChatWindow = document.getElementById('ai-chat-window');
const aiChatClose = document.getElementById('ai-chat-close');
const aiChatMessages = document.getElementById('ai-chat-messages');
const aiChatInput = document.getElementById('ai-chat-input');
const aiChatSend = document.getElementById('ai-chat-send');

const aiConfirmModal = document.getElementById('ai-confirm-modal');
const aiConfirmMessage = document.getElementById('ai-confirm-message');
const aiConfirmDetails = document.getElementById('ai-confirm-details');
const aiConfirmCancel = document.getElementById('ai-confirm-cancel');
const aiConfirmOk = document.getElementById('ai-confirm-ok');

function toggleChatWindow() {
    aiChatWindow.classList.toggle('hidden');
    if (!aiChatWindow.classList.contains('hidden')) {
        aiChatInput.focus();
        // 首次打开时加载历史
        if (aiHistory.length === 0) {
            loadChatHistory();
        }
    }
}

function addChatMessage(sender, message, silent) {
    const row = document.createElement('div');
    row.className = `chat-msg-row ${sender === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai');
    bubble.textContent = message;

    row.appendChild(bubble);
    aiChatMessages.appendChild(row);
    if (!silent) aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    return bubble;
}

function showThinkingDots() {
    const el = document.createElement('div');
    el.className = 'chat-msg-row chat-msg-ai';
    el.id = 'thinking-indicator';
    el.innerHTML = '<div class="chat-bubble chat-bubble-ai"><span class="typing-dots"><i></i><i></i><i></i></span></div>';
    aiChatMessages.appendChild(el);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    return el;
}

function hideThinkingDots() {
    const el = document.getElementById('thinking-indicator');
    if (el) el.remove();
}

async function sendAiMessage() {
    const message = aiChatInput.value.trim();
    if (!message) return;

    // DEBUG: 检查登录状态
    const hasToken = !!localStorage.getItem('auth_token');
    console.log('[AI Debug] token存在:', hasToken, '| AUTH:', window.AUTH?.loggedIn);

    addChatMessage('user', message);
    aiChatInput.value = '';
    showThinkingDots();

    try {
        const res = await fetch(`${API_BASE}/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, history: aiHistory })
        });

        const data = await res.json();
        hideThinkingDots();

        // 更新对话记忆（保留最近 40 条）
        aiHistory.push({ role: 'user', message });
        aiHistory.push({ role: 'assistant', message: data.reply });
        if (aiHistory.length > 40) aiHistory = aiHistory.slice(-40);

        // 同步保存到服务端（PC/移动端共享）
        saveChatHistory(message, data.reply);

        // 始终在聊天窗口显示 AI 回复（即使是需要确认的操作）
        addChatMessage('ai', data.reply);

        if (data.needsConfirm) {
            currentConfirmId = data.confirmId;
            currentActionPreview = data.actionPreview;
            showConfirmDialog(data.reply, data.actionPreview);
        }
    } catch (err) {
        hideThinkingDots();
        console.error('AI聊天失败:', err);
        addChatMessage('ai', '抱歉，网络似乎有问题，请重试 😅');
    }
}

function showConfirmDialog(message, actionPreview) {
    aiConfirmMessage.textContent = message;

    let detailsHtml = '';
    if (actionPreview.type === 'create') {
        const data = actionPreview.data;
        detailsHtml = `<div><strong>操作类型:</strong> 创建任务</div>
                       <div><strong>标题:</strong> ${escapeHtml(data.title)}</div>
                       <div><strong>日期:</strong> ${escapeHtml(data.date)}</div>
                       <div><strong>时间:</strong> ${escapeHtml(data.time)}</div>
                       <div><strong>分类:</strong> ${escapeHtml(data.category)}</div>`;
        if (data.subtasks && data.subtasks.length > 0) {
            detailsHtml += `<div><strong>子任务:</strong> ${escapeHtml(data.subtasks.map(st => st.title).join(', '))}</div>`;
        }
    } else if (actionPreview.type === 'update') {
        const data = actionPreview.data;
        detailsHtml = `<div><strong>操作类型:</strong> 修改任务</div>
                       <div><strong>任务:</strong> ${escapeHtml(data.title)}</div>
                       <div><strong>新时间:</strong> ${escapeHtml(data.time)}</div>`;
    } else if (actionPreview.type === 'delete') {
        const data = actionPreview.data;
        detailsHtml = `<div><strong>操作类型:</strong> 删除任务</div>
                       <div><strong>任务:</strong> ${escapeHtml(data.title)}</div>
                       ${data.onlyCompleted ? '<div><strong>仅删除已完成的</strong></div>' : ''}`;
    } else if (actionPreview.type === 'addSubtask') {
        const data = actionPreview.data;
        detailsHtml = `<div><strong>操作类型:</strong> 添加子任务</div>
                       <div><strong>父任务:</strong> ${escapeHtml(data.parentTitle)}</div>
                       <div><strong>子任务:</strong> ${escapeHtml(data.subtaskTitle)}</div>`;
    } else if (actionPreview.type === 'batchDelete') {
        detailsHtml = `<div><strong>⚠️ 批量删除</strong></div>
                       <div>将删除 <strong>${actionPreview.affectedCount}</strong> 个任务</div>`;
        if (actionPreview.titles && actionPreview.titles.length > 0) {
            detailsHtml += `<div class="mt-2 text-xs text-gray-500">匹配: ${actionPreview.titles.map(t => escapeHtml(t)).join(', ')}</div>`;
            if (actionPreview.affectedCount > actionPreview.titles.length) {
                detailsHtml += `<div class="text-xs text-gray-400">... 还有 ${actionPreview.affectedCount - actionPreview.titles.length} 个任务</div>`;
            }
        }
    } else if (actionPreview.type === 'batchComplete') {
        detailsHtml = `<div><strong>✅ 批量完成</strong></div>
                       <div>将标记完成 <strong>${actionPreview.affectedCount}</strong> 个任务</div>`;
        if (actionPreview.titles && actionPreview.titles.length > 0) {
            detailsHtml += `<div class="mt-2 text-xs text-gray-500">匹配: ${actionPreview.titles.map(t => escapeHtml(t)).join(', ')}</div>`;
            if (actionPreview.affectedCount > actionPreview.titles.length) {
                detailsHtml += `<div class="text-xs text-gray-400">... 还有 ${actionPreview.affectedCount - actionPreview.titles.length} 个任务</div>`;
            }
        }
    } else if (actionPreview.type === 'batchUpdateDate') {
        detailsHtml = `<div><strong>📅 批量修改日期</strong></div>
                       <div>将把 <strong>${actionPreview.affectedCount}</strong> 个任务的日期改为 <strong>${escapeHtml(actionPreview.newDate || '?')}</strong></div>`;
        if (actionPreview.titles && actionPreview.titles.length > 0) {
            detailsHtml += `<div class="mt-2 text-xs text-gray-500">匹配: ${actionPreview.titles.map(t => escapeHtml(t)).join(', ')}</div>`;
            if (actionPreview.affectedCount > actionPreview.titles.length) {
                detailsHtml += `<div class="text-xs text-gray-400">... 还有 ${actionPreview.affectedCount - actionPreview.titles.length} 个任务</div>`;
            }
        }
    } else if (actionPreview.type === 'projectPlan') {
        detailsHtml = `<div><strong>📋 项目计划确认</strong></div>
                       <div><strong>项目:</strong> ${escapeHtml(actionPreview.title)}</div>
                       <div><strong>共:</strong> ${actionPreview.phases.length} 个阶段，${actionPreview.taskCount} 个任务</div>`;
        actionPreview.phases.forEach(phase => {
            detailsHtml += `<div class="mt-2"><strong>🔹 ${escapeHtml(phase.name)}</strong></div>`;
            detailsHtml += '<ul class="text-xs text-gray-600 ml-4" style="list-style: disc; padding-left: 1rem;">';
            phase.tasks.forEach(t => {
                detailsHtml += `<li>${escapeHtml(t.title)} — ${escapeHtml(t.date)} ${escapeHtml(t.time)}</li>`;
            });
            detailsHtml += '</ul>';
        });
    }

    aiConfirmDetails.innerHTML = detailsHtml;
    aiConfirmModal.classList.remove('hidden');
}

function hideConfirmDialog() {
    aiConfirmModal.classList.add('hidden');
    currentConfirmId = null;
    currentActionPreview = null;
}

let isConfirming = false;

async function confirmAction() {
    if (!currentConfirmId || isConfirming) return;
    isConfirming = true;

    showLoading('执行中...');

    try {
        const res = await fetch(`${API_BASE}/ai/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmId: currentConfirmId })
        });

        const data = await res.json();
        hideLoading();
        hideConfirmDialog();

        addChatMessage('ai', data.reply);

        if (data.success && data.actionExecuted) {
            // 如果创建/修改任务有指定日期，自动跳转到该日期（否则用户看不到）
            if (currentActionPreview && currentActionPreview.data && currentActionPreview.data.date) {
                const taskDate = new Date(currentActionPreview.data.date + 'T00:00:00');
                if (!isNaN(taskDate) && taskDate.toDateString() !== selectedDate.toDateString()) {
                    selectedDate = taskDate;
                    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                    selectedDateElement.textContent = `${taskDate.getFullYear()}年${taskDate.getMonth()+1}月${taskDate.getDate()}日 ${dayNames[taskDate.getDay()]}`;
                }
            }
            await loadEventsFromAPI();
            renderEventList();
            renderCalendar();
            renderWeekView();
            renderMonthView();
            renderUpcomingEvents();
            updateEventStats();
            updateProgressStats();
            showToast('✅ 操作成功');
        }
    } catch (err) {
        hideLoading();
        hideConfirmDialog();
        console.error('确认操作失败:', err);
        showToast('❌ 操作失败，请重试', 'error');
        addChatMessage('ai', '操作失败，请重试。');
    } finally {
        isConfirming = false;
    }
}

function cancelAction() {
    if (isConfirming) return; // 防止确认时触发取消（修复双重消息）
    hideConfirmDialog();
    addChatMessage('ai', '已取消操作。');
}

function setupAiChatListeners() {
    aiChatToggle.addEventListener('click', toggleChatWindow);
    aiChatClose.addEventListener('click', toggleChatWindow);
    aiChatSend.addEventListener('click', sendAiMessage);
    aiChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendAiMessage();
        }
        if (e.key === 'Escape') {
            if (!aiChatWindow.classList.contains('hidden')) {
                toggleChatWindow();
            } else if (!aiConfirmModal.classList.contains('hidden')) {
                cancelAction();
            }
        }
    });

    // 快捷操作按钮
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const prompts = {
                '新建任务': '帮我创建一个新任务',
                '今天': '列出今天所有日程',
                '完成': '今天还有哪些任务没完成',
                '效率': '帮我统计各分类任务的完成率',
                '明天': '列出明天所有日程',
                '搜索': '帮我搜索任务',
            };
            const prompt = prompts[action] || action;
            aiChatInput.value = prompt;
            sendAiMessage();
            // 打开聊天窗口（如果关闭的话）
            if (aiChatWindow.classList.contains('hidden')) {
                toggleChatWindow();
            }
        });
    });

    aiConfirmCancel.addEventListener('click', cancelAction);
    aiConfirmOk.addEventListener('click', confirmAction);

    aiConfirmModal.addEventListener('click', (e) => {
        if (e.target === aiConfirmModal) cancelAction();
    });

    // 移动端：点击遮罩关闭聊天
    aiChatWindow.addEventListener('click', (e) => {
        if (e.target === aiChatWindow && window.innerWidth < 768) {
            toggleChatWindow();
        }
    });
}

// ═══════════════════════════════════════════════
// 浏览器通知系统
// ═══════════════════════════════════════════════
const NOTIFY_KEY = 'notify_settings';
let notifySettings = { taskStart: true, dailySummary: false, enabled: false };

function loadNotifySettings() {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    if (raw) notifySettings = JSON.parse(raw);
  } catch(e) {}
}

function saveNotifySettings() {
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(notifySettings));
}

async function requestNotifyPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') {
    notifySettings.enabled = true;
    saveNotifySettings();
    return true;
  }
  const result = await Notification.requestPermission();
  notifySettings.enabled = result === 'granted';
  saveNotifySettings();
  return notifySettings.enabled;
}

function sendNotification(title, body, icon) {
  if (!notifySettings.enabled || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: icon || '/favicon.ico', silent: false });
  } catch(e) {}
}

// 检查即将开始的任务（每 60 秒检查一次）
function checkUpcomingTasks() {
  if (!notifySettings.enabled || !notifySettings.taskStart) return;
  const now = new Date();
  const todayStr = formatDate(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  events.forEach(event => {
    if (event.date !== todayStr || !!event.completed) return;
    if (!event.time) return;
    const [h, m] = event.time.split(':').map(Number);
    const eventMinutes = h * 60 + m;
    const diff = eventMinutes - currentMinutes;
    // 任务开始前 15 分钟提醒
    if (diff === 15 || diff === 5 || diff === 0) {
      const notified = sessionStorage.getItem('notified_' + event.id + '_' + diff);
      if (notified) return;
      sessionStorage.setItem('notified_' + event.id + '_' + diff, '1');
      sendNotification('⏰ 日程提醒', event.title + ' — ' + event.time, '/favicon.ico');
    }
  });
}

// 每日总结（9:00 触发）
let dailySummarySent = false;
function checkDailySummary() {
  if (!notifySettings.enabled || !notifySettings.dailySummary) return;
  const now = new Date();
  if (now.getHours() === 9 && now.getMinutes() === 0 && !dailySummarySent) {
    dailySummarySent = true;
    const todayStr = formatDate(now);
    const todayEvents = events.filter(e => e.date === todayStr);
    const pending = todayEvents.filter(e => !e.completed).length;
    const done = todayEvents.filter(e => !!e.completed).length;
    let body = `今日共 ${todayEvents.length} 个任务`;
    if (done > 0) body += `，已完成 ${done} 个`;
    if (pending > 0) body += `，待完成 ${pending} 个`;
    sendNotification('📋 每日总结', body);
  }
  if (now.getHours() !== 9) dailySummarySent = false;
}

// 每分钟轮询
setInterval(() => {
  checkUpcomingTasks();
  checkDailySummary();
}, 60000);

// 通知按钮交互
function setupNotifyUI() {
  const btn = document.getElementById('notify-btn');
  if (!btn) { console.warn('notify-btn not found'); return; }

  loadNotifySettings();
  updateNotifyBtnUI();

  btn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    // 权限未授予 → 先请求权限（无论 settings 怎么写的）
    if (Notification.permission !== 'granted') {
      if (!window.isSecureContext) {
        showToast('⚠️ 通知需要 HTTPS 才能使用，当前为 HTTP 连接');
        return;
      }
      if (!('Notification' in window)) {
        showToast('你的浏览器不支持通知功能');
        return;
      }
      if (Notification.permission === 'denied') {
        showToast('通知权限已被浏览器阻止，请在浏览器地址栏左侧点击锁图标 → 通知 → 允许');
        return;
      }
      try {
        Notification.requestPermission().then(function(permission) {
          if (permission === 'granted') {
            notifySettings.enabled = true;
            notifySettings.taskStart = true;
            saveNotifySettings();
            updateNotifyBtnUI();
            showToast('通知已开启 ✅');
            sendNotification('✅ 通知已就绪', '你将在任务开始前收到提醒');
          } else {
            notifySettings.enabled = false;
            saveNotifySettings();
            updateNotifyBtnUI();
            showToast('需要允许通知权限才能使用');
          }
        }).catch(function(err) {
          console.error('Notification permission error:', err);
          showToast('通知权限请求失败，请检查浏览器设置');
        });
      } catch(e) {
        console.error('Notification API error:', e);
        showToast('当前环境不支持通知功能');
      }
    } else {
      // 权限已授予 → 确保状态同步，切换每日总结
      notifySettings.enabled = true;
      notifySettings.taskStart = true;
      notifySettings.dailySummary = !notifySettings.dailySummary;
      saveNotifySettings();
      updateNotifyBtnUI();
      showToast(notifySettings.dailySummary ? '每日总结已开启 📋' : '每日总结已关闭');
    }
  });
}

function updateNotifyBtnUI() {
  const btn = document.getElementById('notify-btn');
  if (!btn) return;
  if (Notification.permission === 'granted') {
    btn.className = 'data-btn notify-on';
    btn.innerHTML = '<i class="fa fa-bell mr-1"></i><span>通知</span>';
    btn.title = notifySettings.dailySummary ? '通知已开启 · 每日总结：开' : '通知已开启 · 点击切换每日总结';
  } else {
    btn.className = 'data-btn export-btn';
    btn.innerHTML = '<i class="fa fa-bell-slash mr-1"></i><span>通知</span>';
    btn.title = '开启通知';
  }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    init();
    setupAiChatListeners();
    setupNotifyUI();
    loadNotifySettings();
});