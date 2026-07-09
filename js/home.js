// home.js - 首页功能脚本

// ══════════════════════════════════════════════════════════════
// 农历计算引擎（嵌入式数据，1900-2100 年）
// ══════════════════════════════════════════════════════════════
const LunarCalendar = (function() {
    // 农历数据：每个数字用位标记表示该年闰月及大小月
    const lunarInfo = [
        0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
        0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
        0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
        0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
        0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
        0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
        0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
        0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
        0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
        0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
        0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
        0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
        0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
        0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
        0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
        0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06aa0,0x1a6c4,0x0aae0,
        0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
        0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
        0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
        0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a4d0,0x0d150,0x0f252,
        0x0d520
    ];
    const solarMonth = [31,28,31,30,31,30,31,31,30,31,30,31];
    const Gan = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
    const Zhi = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    const Animals = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
    const lunarDayStr = ['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
        '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
        '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
    const lunarMonthStr = ['','正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'];

    function isLeapYear(y) { return (y%4===0&&y%100!==0)||(y%400===0); }

    function lYearDays(y) {
        let sum=348;
        for(let i=0x8000;i>0x8;i>>=1) sum+=(lunarInfo[y-1900]&i)?1:0;
        return sum+leapDays(y);
    }
    function leapMonth(y) { return lunarInfo[y-1900]&0xf; }
    function leapDays(y) { return leapMonth(y)?((lunarInfo[y-1900]&0x10000)?30:29):0; }
    function monthDays(y,m) { return (lunarInfo[y-1900]&(0x10000>>m))?30:29; }

    // 公历 → 农历
    function solarToLunar(year, month, day) {
        let offset = Math.floor((new Date(year, month-1, day) - new Date(1900,0,31)) / 86400000);
        let y=1900, days=0;
        while(y<2100 && offset>0) { days=lYearDays(y); if(offset<days) break; offset-=days; y++; }
        if(y>2100) return null;
        let m=1, isLeap=false;
        const lm=leapMonth(y);
        while(m<=12 && offset>0) {
            if(isLeap){ days=leapDays(y); if(offset<days) break; offset-=days; isLeap=false; m++; }
            else {
                days=monthDays(y,m);
                if(offset<days) break;
                offset-=days;
                if(m===lm){ isLeap=true; if(offset===0) break; }
                else m++;
            }
        }
        return {
            lYear: y, lMonth: m, lDay: offset+1, isLeap: isLeap && m===lm,
            yearStr: Gan[(y-4)%10]+Zhi[(y-4)%12]+'年',
            monthStr: (isLeap?'闰':'')+lunarMonthStr[m],
            dayStr: lunarDayStr[offset+1],
            animal: Animals[(y-4)%12]
        };
    }

    // 获取节日（农历）
    function getLunarFestival(m, d) {
        const map = {'1,1':'春节','1,15':'元宵节','5,5':'端午节','7,7':'七夕','7,15':'中元节','8,15':'中秋节','9,9':'重阳节','12,30':'除夕','12,29':'除夕'};
        return map[m+','+d] || '';
    }
    // 获取公历节日
    function getSolarFestival(m, d) {
        const map = {'1,1':'元旦','2,14':'情人节','3,8':'妇女节','3,12':'植树节','4,1':'愚人节','4,5':'清明节','5,1':'劳动节','5,4':'青年节','6,1':'儿童节','7,1':'建党节','8,1':'建军节','9,10':'教师节','10,1':'国庆节','10,31':'万圣节','12,24':'平安夜','12,25':'圣诞节'};
        return map[m+','+d] || '';
    }
    // 获取节气（精确公式计算，基于太阳黄经）
    function getSolarTerm(y, m, d) {
        // 24 节气名称 & 对应月份 & 21 世纪 C 常量
        const TERM_DATA = [
            { n:'小寒', m:1,  c:5.4055 },  { n:'大寒', m:1,  c:20.12  },
            { n:'立春', m:2,  c:3.87   },  { n:'雨水', m:2,  c:18.73  },
            { n:'惊蛰', m:3,  c:5.63   },  { n:'春分', m:3,  c:20.46  },
            { n:'清明', m:4,  c:4.81   },  { n:'谷雨', m:4,  c:20.05  },
            { n:'立夏', m:5,  c:5.36   },  { n:'小满', m:5,  c:21.04  },
            { n:'芒种', m:6,  c:5.58   },  { n:'夏至', m:6,  c:21.18  },
            { n:'小暑', m:7,  c:7.05   },  { n:'大暑', m:7,  c:22.93  },
            { n:'立秋', m:8,  c:7.35   },  { n:'处暑', m:8,  c:23.08  },
            { n:'白露', m:9,  c:7.72   },  { n:'秋分', m:9,  c:23.05  },
            { n:'寒露', m:10, c:8.22   },  { n:'霜降', m:10, c:23.45  },
            { n:'立冬', m:11, c:7.55   },  { n:'小雪', m:11, c:22.17  },
            { n:'大雪', m:12, c:7.00   },  { n:'冬至', m:12, c:21.68  },
        ];
        const yOff = y - 2000;
        for (const t of TERM_DATA) {
            const termDay = Math.floor(t.c + 0.2422 * yOff - Math.floor(yOff / 4));
            if (t.m === m && termDay === d) return t.n;
        }
        return '';
    }

    return { solarToLunar, getLunarFestival, getSolarFestival, getSolarTerm, Animals, Gan, Zhi };
})();

// ══════════════════════════════════════════════════════════════
// 节假日 API 缓存（免费 API: timor.tech）
// ══════════════════════════════════════════════════════════════
const HolidayCache = (function() {
    const CACHE_KEY = 'holiday_cache';
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 缓存 24 小时

    let holidayMap = {}; // { '2026-1-1': { name:'元旦', isOff:true } }

    function cacheKey(y) { return CACHE_KEY + '_' + y; }

    function loadLocal(y) {
        try {
            const raw = localStorage.getItem(cacheKey(y));
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (Date.now() - data.ts > CACHE_TTL) return null;
            return data.map;
        } catch(e) { return null; }
    }

    function saveLocal(y, map) {
        try { localStorage.setItem(cacheKey(y), JSON.stringify({ ts: Date.now(), map })); } catch(e) {}
    }

    async function fetchYear(y) {
        // 先读缓存
        const cached = loadLocal(y);
        if (cached) {
            Object.assign(holidayMap, cached);
            return;
        }
        try {
            // timor.tech 免费节假日 API（手动超时控制，兼容更多浏览器）
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const resp = await fetch(`https://timor.tech/api/holiday/year/${y}`, { signal: controller.signal });
            clearTimeout(timer);
            if (!resp.ok) throw new Error('API error');
            const json = await resp.json();
            if (json.code === 0 && json.holiday) {
                const map = {};
                for (const [date, info] of Object.entries(json.holiday)) {
                    if (info.holiday) {
                        map[date] = { name: info.name, isOff: info.wage === 3 || info.wage === 2 };
                    }
                }
                Object.assign(holidayMap, map);
                saveLocal(y, map);
            }
        } catch(e) {
            console.warn('节假日 API 获取失败，使用本地节日数据', e);
        }
    }

    function getHoliday(y, m, d) {
        // API 返回格式 "MM-DD"（不含年份），如 "01-01"、"10-01"
        const key = `${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const info = holidayMap[key];
        return info || null;
    }

    // 判断某天是否为休息日（周末 或 法定节假日，排除调休补班）
    function isRestDay(y, m, d) {
        const h = getHoliday(y, m, d);
        if (h && h.isOff) return true;   // 法定节假日放假
        if (h && !h.isOff) return false; // 调休补班日（周末但上班）
        // 普通周末
        const dayOfWeek = new Date(y, m - 1, d).getDay();
        return dayOfWeek === 0 || dayOfWeek === 6;
    }

    // 判断某天是否为工作日
    function isWorkday(y, m, d) {
        return !isRestDay(y, m, d);
    }

    // 获取从某天开始的下一个工作日（往前最多搜 60 天）
    function getNextWorkday(fromDate) {
        let d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + 1);
        for (let i = 0; i < 60; i++) {
            if (isWorkday(d.getFullYear(), d.getMonth() + 1, d.getDate())) return d;
            d.setDate(d.getDate() + 1);
        }
        return null;
    }

    return { fetchYear, getHoliday, isRestDay, isWorkday, getNextWorkday };
})();

// ── 时钟刻度初始化 ──────────────────────────────────────────
const clock = document.getElementById('clock');
for (let i = 0; i < 60; i++) {
    const scale = document.createElement('div');
    scale.className = 'clock-scale';          // ← 改为 clock-scale
    if (i % 5 === 0) {
        scale.classList.add('big');
        const number = document.createElement('div');
        number.className = 'clock-number';    // ← 改为 clock-number
        number.textContent = i === 0 ? 12 : i / 5;
        number.style.transform = `translate(-50%, -50%) rotate(${i * 6}deg) translateY(-110px) rotate(-${i * 6}deg)`;
        clock.appendChild(number);
    }
    scale.style.transform = `rotate(${i * 6}deg)`;
    clock.appendChild(scale);
}

// ── 时钟 ────────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const hourAngle   = (hours % 12 + minutes / 60) * (360 / 12);
    const minuteAngle = (minutes + seconds / 60) * (360 / 60);
    const secondAngle = seconds * (360 / 60);

    document.getElementById('hour-hand').style.transform   = `rotate(${hourAngle}deg)`;
    document.getElementById('minute-hand').style.transform = `rotate(${minuteAngle}deg)`;
    document.getElementById('second-hand').style.transform = `rotate(${secondAngle}deg)`;

    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day   = String(now.getDate()).padStart(2, '0');
    const weekDays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    document.getElementById('date-time').innerHTML =
        `${year}年${month}月${day}日 ${weekDays[now.getDay()]}<br>现在是北京时间 ${hh}:${mm}:${ss}`;

    // 距周末（区分"周末进行中"/"假期进行中"/倒计时）
    const dow = now.getDay();
    const isRest = HolidayCache.isRestDay(year, parseInt(month), parseInt(day));
    const wCard = document.getElementById('weekend-card');
    if (dow === 0 || dow === 6) {
        wCard.innerHTML = '周末进行中 <span class="card-number" id="weekend-days">🎉</span>';
    } else if (isRest) {
        wCard.innerHTML = '假期进行中 <span class="card-number" id="weekend-days">🌴</span>';
    } else {
        const daysToWeekend = (6 - dow + 7) % 7;
        wCard.innerHTML = `距周末 <span class="card-number" id="weekend-days">${daysToWeekend}</span> 天`;
    }

    // 距发工资（每月15号，当天 → "发工资啦"）
    const sCard = document.getElementById('salary-card');
    if (parseInt(day) === 15) {
        sCard.innerHTML = '发工资啦 <span class="card-number" id="salary-days">💰</span>';
    } else {
        const salaryDate = new Date(now.getFullYear(), now.getMonth(), 15);
        if (now.getDate() > 15) salaryDate.setMonth(salaryDate.getMonth() + 1);
        const salaryDays = Math.ceil((salaryDate - now) / (1000 * 60 * 60 * 24));
        sCard.innerHTML = `距发工资 <span class="card-number" id="salary-days">${salaryDays}</span> 天`;
    }

    // 距交房租（每月20号，当天 → "记得交房租"）
    const rCard = document.getElementById('rent-card');
    if (parseInt(day) === 20) {
        rCard.innerHTML = '记得交房租 <span class="card-number" id="rent-days">⚠️</span>';
    } else {
        const rentDate = new Date(now.getFullYear(), now.getMonth(), 20);
        if (now.getDate() > 20) rentDate.setMonth(rentDate.getMonth() + 1);
        const rentDays = Math.ceil((rentDate - now) / (1000 * 60 * 60 * 24));
        rCard.innerHTML = `距交房租 <span class="card-number" id="rent-days">${rentDays}</span> 天`;
    }

    // 接下来的节假日（前3个）
    updateHolidayCards(now);

    updateGreeting(now);
}

// ── 时间问候语（节假日 > 节气 > 时令+时段）─────────────────────
const GREETING_DATA = {
    // 节日（公历 + 农历）
    holiday: {
        '元旦':   ['新年快乐！', '新的一年，新的开始。🎉'],
        '春节':   ['春节快乐！', '新春大吉，万事如意！🧧'],
        '元宵节': ['元宵节快乐！', '花好月圆人团圆。🏮'],
        '清明节': ['清明安康', '缅怀先人，珍惜当下。🌿'],
        '劳动节': ['劳动节快乐！', '致敬每一位劳动者。💼'],
        '端午节': ['端午安康！', '粽叶飘香，龙舟竞渡。🐉'],
        '七夕':   ['七夕快乐！', '愿有情人终成眷属。💫'],
        '中元节': ['中元节', '缅怀先人，慎终追远。🕯️'],
        '中秋节': ['中秋快乐！', '月圆人团圆，千里共婵娟。🌕'],
        '重阳节': ['重阳安康！', '登高望远，敬老爱老。🍂'],
        '除夕':   ['除夕快乐！', '辞旧迎新，阖家团圆。🧨'],
        '国庆节': ['国庆节快乐！', '祝福祖国繁荣昌盛。🇨🇳'],
        '圣诞节': ['圣诞快乐！', 'Merry Christmas! 🎄'],
        '情人节': ['情人节快乐！', '愿爱与被爱都如约而至。💕'],
        '妇女节': ['妇女节快乐！', '致敬每一位了不起的她。🌸'],
        '儿童节': ['儿童节快乐！', '愿你永葆童心。🎈'],
        '教师节': ['教师节快乐！', '教诲如春风，师恩似海深。📚'],
        '平安夜': ['平安夜快乐！', '愿平安与温暖伴你左右。🕯️'],
        '万圣节': ['万圣节快乐！', 'Trick or Treat! 🎃'],
        '建党节': ['建党节', '不忘初心，牢记使命。🚩'],
        '建军节': ['建军节', '致敬最可爱的人。⭐'],
    },
    // 二十四节气
    term: {
        '立春': ['立春了！', '万物复苏，春意盎然。🌱'],
        '雨水': ['雨水时节', '春雨润物，草木萌动。🌧️'],
        '惊蛰': ['惊蛰时节', '春雷乍动，万物生机。⚡'],
        '春分': ['春分时节', '昼夜平分，春色满园。🌸'],
        '清明': ['清明时节', '气清景明，万物皆显。🌿'],
        '谷雨': ['谷雨时节', '雨生百谷，春意渐深。🌾'],
        '立夏': ['立夏了！', '夏日初始，万物繁茂。☀️'],
        '小满': ['小满时节', '物致于此，小得盈满。🌾'],
        '芒种': ['芒种时节', '有芒之种，忙种忙收。🌾'],
        '夏至': ['夏至已至', '一年中最长的白天。☀️'],
        '小暑': ['小暑时节', '暑气渐盛，注意防暑。🌡️'],
        '大暑': ['大暑时节', '一年中最热的时候到了。🔥'],
        '立秋': ['立秋了！', '一叶知秋，凉风渐起。🍂'],
        '处暑': ['处暑时节', '暑气消退，秋意渐浓。🍃'],
        '白露': ['白露时节', '白露为霜，秋色宜人。💧'],
        '秋分': ['秋分时节', '秋高气爽，丰收在望。🌾'],
        '寒露': ['寒露时节', '露气寒冷，将凝结也。🍁'],
        '霜降': ['霜降时节', '气肃而凝，露结为霜。❄️'],
        '立冬': ['立冬了！', '冬日序曲，注意保暖。🧣'],
        '小雪': ['小雪时节', '天地初寒，雪落无声。❄️'],
        '大雪': ['大雪时节', '大者盛也，至此而雪盛。⛄'],
        '冬至': ['冬至安康', '冬至大如年，记得吃饺子。🥟'],
        '小寒': ['小寒时节', '一年中最冷的日子。🧊'],
        '大寒': ['大寒时节', '寒气逆极，春归有期。🥶'],
    },
};

// 简单的伪随机（同一天返回相同结果）
function daySeed(y, m, d) {
    return Math.abs(Math.floor((y * 397 + m * 73 + d) * 9301 + 49297) % 233280);
}

function setGreeting(g, s) {
    document.getElementById('greeting-text').textContent = g;
    document.getElementById('sub-text').textContent = s;
}

// 节日/节气早上 5:00-10:00 追加时段问候
function holidayGreeting(base, sub, hours) {
    if (hours >= 5 && hours < 10) {
        setGreeting(base + '，早上好！', sub);
    } else {
        setGreeting(base, sub);
    }
}

let _lastGreetingHour = -1;
function updateGreeting(now) {
    const hours = now.getHours();
    if (hours === _lastGreetingHour) return;
    _lastGreetingHour = hours;

    const month = now.getMonth() + 1;
    const day   = now.getDate();
    const year  = now.getFullYear();

    // 1. API 节假日（法定节假日，最高优先级）
    const apiHoliday = HolidayCache.getHoliday(year, month, day);
    if (apiHoliday && apiHoliday.name) {
        const h = GREETING_DATA.holiday[apiHoliday.name];
        if (h) { holidayGreeting(h[0], h[1], hours); return; }
        // API 返回了但本地没映射，兜底
        holidayGreeting(apiHoliday.name + '快乐！', '节日愉快，好好享受假期吧~', hours);
        return;
    }

    // 2. 农历节日
    const lunar = LunarCalendar.solarToLunar(year, month, day);
    if (lunar) {
        const lunarFest = LunarCalendar.getLunarFestival(lunar.lMonth, lunar.lDay);
        if (lunarFest && GREETING_DATA.holiday[lunarFest]) {
            const h = GREETING_DATA.holiday[lunarFest];
            holidayGreeting(h[0], h[1], hours); return;
        }
    }

    // 3. 公历节日（内置数据）
    const solarFest = LunarCalendar.getSolarFestival(month, day);
    if (solarFest && GREETING_DATA.holiday[solarFest]) {
        const h = GREETING_DATA.holiday[solarFest];
        holidayGreeting(h[0], h[1], hours); return;
    }

    // 4. 节气
    const term = LunarCalendar.getSolarTerm(year, month, day);
    if (term && GREETING_DATA.term[term]) {
        const t = GREETING_DATA.term[term];
        holidayGreeting(t[0], t[1], hours); return;
    }

    // 5. 普通日：根据时段 + 时令
    const seed = daySeed(year, month, day);

    // 时段问候
    const timeSlots = [
        [5,  9,  '早上好'],
        [9,  12, '上午好'],
        [12, 14, '中午好'],
        [14, 17, '下午好'],
        [17, 22, '晚上好'],
    ];
    const slot = timeSlots.find(([s, e]) => hours >= s && hours < e);
    const timeGreeting = slot ? slot[2] : '夜深了';

    // 时令副语（四季各 4 条，按天轮换）
    const seasonSubs = {
        spring: ['春暖花开，万物生长。🌸','一年之计在于春。🌿','不负春光，野蛮生长。🦋','春风十里，不如你。🌺'],
        summer: ['绿树阴浓夏日长。☀️','蝉鸣声声，阳光正好。🌴','西瓜空调，夏日限定。🍉','生如夏花，热烈绚烂。🌻'],
        autumn: ['秋高气爽，岁月静好。🍂','春华秋实，硕果累累。🍁','一叶知秋，天凉好个秋。🌾','人间忽晚，山河已秋。🍃'],
        winter: ['愿你三冬暖，春不寒。❄️','围炉煮茶，岁月静好。🔥','冬天来了，春天还会远吗？⛄','岁末将至，敬颂冬绥。🎿'],
        night:  ['早点休息，注意身体。','夜深了，该睡觉啦~','晚安，好梦。🌙','熬夜伤身，快睡吧！💤'],
    };

    let seasonKey;
    if (month >= 3 && month <= 5) seasonKey = 'spring';
    else if (month >= 6 && month <= 8) seasonKey = 'summer';
    else if (month >= 9 && month <= 11) seasonKey = 'autumn';
    else seasonKey = 'winter';

    const pool = hours >= 5 && hours < 22 ? seasonSubs[seasonKey] : seasonSubs['night'];
    const subText = pool[seed % pool.length];

    // 部分日子把时令词做主问候，时间做副语，增加变化
    if (seed % 3 === 0 && hours >= 6 && hours < 22) {
        // 时令词做主问候语
        const seasonMains = {
            spring: ['春日好时光','春意盎然','春风拂面','春光正好'],
            summer: ['夏日悠悠','盛夏光年','夏日炎炎','夏木已成荫'],
            autumn: ['秋日静好','金秋时节','秋意渐浓','天凉好个秋'],
            winter: ['冬日暖阳','冬日安暖','冬日漫漫','岁暮天寒'],
        };
        const mains = seasonMains[seasonKey];
        setGreeting(mains[seed % mains.length], timeGreeting + '，' + subText.replace(/[^一-鿿]/g, '').slice(0, 10));
    } else {
        setGreeting(timeGreeting, subText);
    }
}

// ── 天气（上海嘉定 · Open-Meteo 免费 API） ─────────────────────
const WeatherCard = (function() {
    const LAT = 31.38, LON = 121.25; // 上海嘉定
    const CACHE_KEY = 'weather_cache';
    const CACHE_TTL = 30 * 60 * 1000; // 30 分钟

    // WMO 天气码 → 图标 + 描述
    const CODE_MAP = {
        0:  ['☀️','晴'],
        1:  ['🌤️','少云'], 2: ['⛅','多云'], 3: ['☁️','阴'],
        45: ['🌫️','雾'], 48: ['🌫️','冻雾'],
        51: ['🌦️','小毛毛雨'], 53: ['🌦️','毛毛雨'], 55: ['🌦️','大毛毛雨'],
        61: ['🌧️','小雨'], 63: ['🌧️','中雨'], 65: ['🌧️','大雨'],
        71: ['🌨️','小雪'], 73: ['🌨️','中雪'], 75: ['🌨️','大雪'],
        80: ['🌦️','阵雨'], 81: ['🌦️','中阵雨'], 82: ['🌦️','大阵雨'],
        85: ['🌨️','小阵雪'], 86: ['🌨️','大阵雪'],
        95: ['⛈️','雷暴'], 96: ['⛈️','雷暴+小冰雹'], 99: ['⛈️','雷暴+大冰雹'],
    };

    function suggestion(code, temp, wind, humidity) {
        const tips = [];
        if ([51,53,55,61,63,65,80,81,82,95,96,99].includes(code)) tips.push('🌂 今天有雨，出门记得带伞');
        if (temp >= 35) tips.push('🔥 高温天气，注意防暑降温，多喝水');
        if (temp >= 30 && temp < 35) tips.push('☀️ 天气较热，注意防晒补水');
        if (temp <= 5) tips.push('🧣 天气寒冷，注意保暖防冻');
        if (temp <= 12 && temp > 5) tips.push('🧥 温度偏凉，建议穿外套');
        if ([45,48].includes(code)) tips.push('🚗 有雾天气，开车注意安全');
        if (wind >= 10) tips.push('💨 风力较大，注意防风');
        if (humidity >= 90) tips.push('💧 湿度很高，注意防潮');
        if (code === 0 && temp >= 18 && temp <= 28 && wind < 5) tips.push('🌈 天气舒适，适合户外活动');
        if (tips.length === 0) tips.push('👋 今天天气不错，祝你愉快');
        return tips[0];
    }

    async function fetchWeather() {
        const card = document.getElementById('weather-card');
        // 读缓存
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                if (Date.now() - data.ts < CACHE_TTL) {
                    // 有缓存：直接显示，去掉 loading 类（无闪烁）
                    card.classList.remove('loading');
                    render(data);
                    return;
                }
            }
        } catch(e) {}

        // 无有效缓存：保持 loading 状态（opacity:0），等待 API 返回后 fade-in
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=Asia/Shanghai`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('API error');
            const json = await resp.json();
            const cur = json.current;
            const data = {
                temp: Math.round(cur.temperature_2m),
                apparent: Math.round(cur.apparent_temperature),
                humidity: cur.relative_humidity_2m,
                wind: cur.wind_speed_10m.toFixed(1),
                code: cur.weather_code,
                ts: Date.now()
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            card.classList.remove('loading');
            render(data);
        } catch(e) {
            console.warn('天气 API 获取失败', e);
            // 显示缓存中过期的数据
            try {
                const raw = localStorage.getItem(CACHE_KEY);
                if (raw) {
                    card.classList.remove('loading');
                    render(JSON.parse(raw));
                } else {
                    card.classList.remove('loading');
                    showError();
                }
            } catch(_) { card.classList.remove('loading'); showError(); }
        }
    }

    function render(d) {
        const [icon, desc] = CODE_MAP[d.code] || ['🌡️', '未知'];
        document.getElementById('weather-icon').textContent = icon;
        document.getElementById('weather-temp').textContent = d.temp + '°';
        document.getElementById('weather-detail').innerHTML =
            `<span>体感 ${d.apparent}°</span><span>💧 ${d.humidity}%</span><span>🌬 ${d.wind}m/s</span>`;
        document.getElementById('weather-tip').textContent =
            '💡 ' + suggestion(d.code, d.temp, parseFloat(d.wind), d.humidity) + '  |  ' + desc;
    }

    function showError() {
        document.getElementById('weather-icon').textContent = '🌡️';
        document.getElementById('weather-temp').textContent = '--°';
        document.getElementById('weather-detail').innerHTML = '<span>天气加载失败</span>';
        document.getElementById('weather-tip').textContent = '💡 下拉刷新试试';
    }

    return { fetchWeather };
})();

// ── 节假日卡片更新 ──────────────────────────────────────────
function updateHolidayCards(now) {
    const year = now.getFullYear();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // 取本年 + 明年的节假日日期
    const getHolidays = (y) => {
        const ly = (y===2026)?{spring:[2,17],de:[5,30],mid:[9,25],eve:[2,16]}:
                  (y===2027)?{spring:[2,6],de:[5,19],mid:[9,15],eve:[2,5]}:
                  (y===2028)?{spring:[1,26],de:[5,7],mid:[10,3],eve:[1,25]}:
                  (y===2029)?{spring:[2,13],de:[5,27],mid:[9,22],eve:[2,12]}:
                            {spring:[2,3],de:[5,16],mid:[9,12],eve:[2,2]};
        return [
            { name:'元旦', icon:'🎉', date:new Date(y,0,1) },
            { name:'春节', icon:'🧧', date:new Date(y,ly.spring[0]-1,ly.spring[1]) },
            { name:'清明节', icon:'🌿', date:new Date(y,3,5) },
            { name:'劳动节', icon:'💼', date:new Date(y,4,1) },
            { name:'端午节', icon:'🐉', date:new Date(y,ly.de[0]-1,ly.de[1]) },
            { name:'中秋节', icon:'🌕', date:new Date(y,ly.mid[0]-1,ly.mid[1]) },
            { name:'国庆节', icon:'🇨🇳', date:new Date(y,9,1) },
            { name:'圣诞节', icon:'🎄', date:new Date(y,11,25) },
        ];
    };
    const all = [...getHolidays(year), ...getHolidays(year+1)]
        .filter(h => h.date >= today)
        .sort((a,b) => a.date - b.date)
        .slice(0, 2);

    for (let i = 0; i < 2; i++) {
        const card = document.getElementById('holiday-card-' + (i+1));
        if (!card) continue;
        if (all[i]) {
            const diff = Math.ceil((all[i].date - now) / 86400000);
            if (diff <= 0) {
                // 节日当天 → 节日快乐
                card.innerHTML = `${all[i].icon} ${all[i].name} <span class="card-number">🎉</span>`;
            } else {
                card.innerHTML = `<span class="card-label">${all[i].icon} ${all[i].name}</span><span class="card-number">${diff}</span> 天`;
            }
        } else {
            card.innerHTML = '<span class="card-label">--</span><span class="card-number">--</span> 天';
        }
    }
}

// ── 日历 ────────────────────────────────────────────────────
let holidayReady = false;

async function initYearMonthSelectors() {
    const yearSelect  = document.getElementById('year-select');
    const monthSelect = document.getElementById('month-select');
    const now = new Date();
    const currentYear = now.getFullYear();

    for (let y = currentYear - 10; y <= currentYear + 10; y++) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y + '年';
        if (y === currentYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }
    for (let m = 0; m < 12; m++) {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = (m + 1) + '月';
        if (m === now.getMonth()) opt.selected = true;
        monthSelect.appendChild(opt);
    }

    yearSelect.addEventListener('change', updateCalendar);
    monthSelect.addEventListener('change', updateCalendar);

    // 左右箭头切换月份
    document.getElementById('month-prev').addEventListener('click', () => {
        let m = parseInt(monthSelect.value);
        let y = parseInt(yearSelect.value);
        if (m === 0) { m = 11; y--; yearSelect.value = y; }
        else m--;
        monthSelect.value = m;
        updateCalendar();
    });
    document.getElementById('month-next').addEventListener('click', () => {
        let m = parseInt(monthSelect.value);
        let y = parseInt(yearSelect.value);
        if (m === 11) { m = 0; y++; yearSelect.value = y; }
        else m++;
        monthSelect.value = m;
        updateCalendar();
    });

    // 预加载当年节假日，先渲染再异步更新
    updateCalendar(); // 用本地数据立即渲染
    await HolidayCache.fetchYear(currentYear);
    holidayReady = true;
    updateCalendar(); // API 返回后重新渲染带节假日标记
}

function updateCalendar() {
    const yearSelect   = document.getElementById('year-select');
    const monthSelect  = document.getElementById('month-select');
    const todayButton  = document.getElementById('today-button');
    const calendarTable = document.querySelector('.calendar-body table');

    // 防御：元素未就绪则跳过
    if (!yearSelect || !monthSelect || !calendarTable) {
        console.warn('日历元素未就绪，跳过渲染');
        return;
    }

    const now          = new Date();
    const selectedYear  = parseInt(yearSelect.value) || now.getFullYear();
    const selectedMonth = parseInt(monthSelect.value) || now.getMonth();

    if (todayButton) {
        todayButton.classList.toggle('visible',
            selectedYear !== now.getFullYear() || selectedMonth !== now.getMonth());
    }

    // 如果切换了年份，异步加载该年节假日（不阻塞渲染）
    if (selectedYear !== now.getFullYear()) {
        HolidayCache.fetchYear(selectedYear);
    }

    const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay();
    const daysInMonth    = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const weekDays = ['日','一','二','三','四','五','六'];

    let html = '<tr>' + weekDays.map(d => `<th>${d}</th>`).join('') + '</tr><tr>';

    for (let i = 0; i < firstDayOfWeek; i++) html += '<td></td>';

    for (let d = 1; d <= daysInMonth; d++) {
        if ((d + firstDayOfWeek - 1) % 7 === 0 && d > 1) html += '</tr><tr>';

        const isToday = d === now.getDate() && selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
        const dayOfWeek = (firstDayOfWeek + d - 1) % 7;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // 农历
        const lunar = LunarCalendar.solarToLunar(selectedYear, selectedMonth + 1, d);
        const lunarFest = lunar ? LunarCalendar.getLunarFestival(lunar.lMonth, lunar.lDay) : '';
        const solarFest = LunarCalendar.getSolarFestival(selectedMonth + 1, d);
        const solarTerm = LunarCalendar.getSolarTerm(selectedYear, selectedMonth + 1, d);
        const holiday = HolidayCache.getHoliday(selectedYear, selectedMonth + 1, d);

        // 优先级：API节假日 > 公历节日 > 农历节日 > 节气 > 农历日期
        let badge = '', badgeClass = '';

        if (holiday && holiday.name) {
            badge = holiday.name.length > 3 ? holiday.name.slice(0,3) : holiday.name;
            badgeClass = 'holiday-badge';
        } else if (solarFest) {
            badge = solarFest;
            badgeClass = 'solar-badge';
        } else if (lunarFest) {
            badge = lunarFest.length > 3 ? lunarFest.slice(0,3) : lunarFest;
            badgeClass = 'lunar-badge';
        } else if (solarTerm) {
            badge = solarTerm;
            badgeClass = 'term-badge';
        }

        let lunarDisplay = '';
        if (lunar) {
            const ld = lunar.lDay;
            if (ld === 1) {
                lunarDisplay = lunar.monthStr; // 初一显示月份
            } else {
                lunarDisplay = lunar.dayStr;
            }
            // 农历节日红色显示
            if (lunarFest) {
                lunarDisplay = `<span class="lunar-festival">${lunarFest}</span>`;
            }
        }

        // 组装 CSS class
        let cls = '';
        if (isToday) cls += ' today';
        if (isWeekend) cls += ' weekend';

        // 判断是否为 API 返回的休息日
        const restDay = HolidayCache.isRestDay(selectedYear, selectedMonth + 1, d);
        if (restDay) cls += ' rest-day';
        if (holiday && !holiday.isOff) cls += ' work-day'; // 调休补班

        html += `<td class="${cls.trim()}" data-date="${selectedYear}-${selectedMonth+1}-${d}">`;
        html += `<span class="solar-day">${d}</span>`;

        if (badge) {
            html += `<span class="day-badge ${badgeClass}">${badge}</span>`;
        } else if (lunarDisplay) {
            html += `<span class="lunar-day">${lunarDisplay}</span>`;
        }

        html += '</td>';
    }
    // 补满 6 行数据防止 CLS（表头 1 行 + 数据 6 行 = 共 7 个 <tr>）
    while ((html.match(/<tr>/g) || []).length < 7) {
        html += '<tr>' + '<td></td>'.repeat(7) + '</tr>';
    }
    calendarTable.innerHTML = html;
}

document.getElementById('today-button').addEventListener('click', () => {
    const now = new Date();
    document.getElementById('year-select').value  = now.getFullYear();
    document.getElementById('month-select').value = now.getMonth();
    updateCalendar();
});

// ── 倒计时（智能工作日判断）─────────────────────────────────
let _lastRingState = null; // 追踪环状态变化：'resting' | 'counting'

function _triggerRingSwitch(ringEl) {
    // 短暂添加 switching class 触发 scale+opacity 动画，掩盖 conic-gradient 硬切
    ringEl.classList.add('switching');
    setTimeout(() => ringEl.classList.remove('switching'), 350);
}

function updateCountdown() {
    const now      = new Date();
    const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const workStartToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0);
    const workEndToday   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0, 0);
    const ringEl = document.getElementById('progress-ring');
    const textEl = document.getElementById('countdown-text');

    const todayIsWorkday = HolidayCache.isWorkday(now.getFullYear(), now.getMonth() + 1, now.getDate());

    let targetTime, message;

    if (todayIsWorkday) {
        // ── 工作日 ──────────────────────────────────────────
        if (now < workStartToday) {
            // 上班前：距上班倒计时
            targetTime = workStartToday;
            message = '距离上班还有';
        } else if (now < workEndToday) {
            // 上班中：距下班倒计时
            targetTime = workEndToday;
            message = '距离下班还有';
        } else {
            // 下班后：休息中
            textEl.textContent = '休息中';
            if (_lastRingState !== 'resting') { _lastRingState = 'resting'; _triggerRingSwitch(ringEl); }
            ringEl.className = 'progress-ring resting';
            return;
        }
    } else {
        // ── 休息日 ──────────────────────────────────────────
        const nextWorkday = HolidayCache.getNextWorkday(now);
        if (nextWorkday) {
            const nextWorkStart = new Date(nextWorkday.getFullYear(), nextWorkday.getMonth(), nextWorkday.getDate(), 9, 0, 0);
            const oneHourBefore = new Date(nextWorkStart.getTime() - 60 * 60 * 1000); // 上班前 1 小时（8:00）

            if (now >= oneHourBefore && now < nextWorkStart) {
                // 距离下个工作日上班 ≤1 小时 → 显示上班倒计时
                targetTime = nextWorkStart;
                message = '距离上班还有';
            } else {
                // 休息中
                textEl.textContent = '休息中';
                if (_lastRingState !== 'resting') { _lastRingState = 'resting'; _triggerRingSwitch(ringEl); }
                ringEl.className = 'progress-ring resting';
                return;
            }
        } else {
            // 找不到下个工作日（理论上不会）
            textEl.textContent = '休息中';
            if (_lastRingState !== 'resting') { _lastRingState = 'resting'; _triggerRingSwitch(ringEl); }
            ringEl.style.background = '#a0c4a0';
            return;
        }
    }

    // ── 倒计时 & 进度环 ─────────────────────────────────────
    if (_lastRingState !== 'counting') { _lastRingState = 'counting'; _triggerRingSwitch(ringEl); }
    ringEl.className = 'progress-ring'; // 清除 resting 状态
    const totalSeconds = Math.floor((targetTime - now) / 1000);
    if (totalSeconds <= 0) {
        textEl.textContent = '休息中';
        ringEl.className = 'progress-ring resting';
        return;
    }
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    textEl.textContent = `${message}\n${hh}:${mm}:${ss}`;

    // 进度环
    let progress;
    if (message === '距离上班还有') {
        // 从当天 0:00 到上班时刻
        const dayStart = new Date(targetTime.getFullYear(), targetTime.getMonth(), targetTime.getDate());
        const total = targetTime - dayStart;
        const elapsed = total - (targetTime - now);
        progress = total > 0 ? Math.max(0, Math.min(1, elapsed / total)) : 0;
    } else {
        // 距离下班：从 9:00 到 18:00
        const total = 9 * 60 * 60 * 1000; // 9 小时（9:00-18:00）
        const elapsed = total - (targetTime - now);
        progress = total > 0 ? Math.max(0, Math.min(1, elapsed / total)) : 0;
    }
    ringEl.style.background = `conic-gradient(#007BFF ${progress * 360}deg, #ccc ${progress * 360}deg)`;
}

// ── 趣味卡片 ─────────────────────────────────────────────────
const funCard  = document.getElementById('fun-card');
const funQuotes = [
    '别卷了休息下 😴',
    '今天效率满分 💯',
    '摸鱼被抓到了 🐟',
    '记得喝水 💧',
    '起来活动一下 🏃',
    '保护眼睛，眨一眨 👀',
    '你是最棒的 ✨',
    '累了就摸摸鱼 🐠',
    '别忘了吃水果 🍎',
    '深呼吸，放松～ 🌿',
    '代码和人，有一个能跑就行 😂',
    'bug 退散！🔮',
    '再写一行就休息 📝',
    '今天也是元气满满的一天 ☀️',
    '世界那么大，先去倒杯水 🥤',
    '这需求合理吗？🤔',
    '工作重要，健康更重要 ❤️',
    '悄悄摸鱼，然后惊艳所有人 🎣',
];
let clickCount = 0;
let lastQuoteIndex = -1;

funCard.addEventListener('click', () => {
    clickCount++;

    // 随机抽一条语录，避免连续重复
    let idx;
    do {
        idx = Math.floor(Math.random() * funQuotes.length);
    } while (idx === lastQuoteIndex && funQuotes.length > 1);
    lastQuoteIndex = idx;

    if (clickCount <= 3) {
        // 前 3 次：显示语录 + 计数
        funCard.textContent = funQuotes[idx];
    } else {
        // 第 4 次起：语录 + 小计数角标风格（简洁）
        funCard.textContent = funQuotes[idx];
        // 每隔几次在结尾偷偷加个计数彩蛋
        if (clickCount % 10 === 0) {
            funCard.textContent = `已点 ${clickCount} 次… ${funQuotes[idx]}`;
        }
    }
});

// ── 自定义纪念日卡片 ────────────────────────────────────────────
const memorialCard  = document.getElementById('memorial-card');
const memorialText  = document.getElementById('memorial-text');
const memorialDays  = document.getElementById('memorial-days');
const memorialUnit  = document.getElementById('memorial-unit');
const MEMORIAL_KEY  = 'memorial_day';

function loadMemorial() {
    try {
        const raw = localStorage.getItem(MEMORIAL_KEY);
        if (raw) return JSON.parse(raw);
    } catch(e) {}
    return null;
}

function saveMemorial(data) {
    localStorage.setItem(MEMORIAL_KEY, JSON.stringify(data));
}

function renderMemorial(data) {
    if (!data) {
        memorialText.textContent = '+ 设置纪念日';
        memorialDays.textContent = '';
        memorialUnit.style.display = 'none';
        return;
    }
    const target = new Date(data.date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - today) / 86400000);
    if (diff === 0) {
        memorialText.textContent = '🎉 ' + data.name;
        memorialDays.textContent = '🎉';
        memorialUnit.style.display = 'none';
    } else if (diff > 0) {
        memorialText.textContent = '距 ' + data.name;
        memorialDays.textContent = diff;
        memorialUnit.style.display = '';
    } else {
        memorialText.textContent = data.name + ' 已过';
        memorialDays.textContent = Math.abs(diff);
        memorialUnit.style.display = '';
    }
}

function updateMemorialCountdown() {
    const data = loadMemorial();
    if (data) renderMemorial(data);
}

memorialCard.addEventListener('click', () => {
    const existing = loadMemorial();
    const defaultName = existing ? existing.name : '';
    const defaultDate = existing ? existing.date : '';
    const tip = existing ? '修改纪念日（取消则保留原设置）' : '设置你的纪念日';

    const name = prompt(tip + '\n\n纪念日名称：', defaultName);
    if (name === null) return; // 取消
    const trimmedName = name.trim();
    if (!trimmedName) {
        // 如果原来有设置，输入空 = 删除
        if (existing && confirm('要删除「' + existing.name + '」纪念日吗？')) {
            localStorage.removeItem(MEMORIAL_KEY);
            renderMemorial(null);
        }
        return;
    }

    const date = prompt('日期（格式：YYYY-MM-DD）：', defaultDate);
    if (date === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
        alert('日期格式不对，请用 YYYY-MM-DD 格式（如 2026-12-25）');
        return;
    }

    const data = { name: trimmedName, date: date.trim() };
    saveMemorial(data);
    renderMemorial(data);
});

// 初始化
(function() {
    const data = loadMemorial();
    renderMemorial(data);
})();

// ── 图片轮播 ─────────────────────────────────────────────────
const carouselSlides = document.getElementById('carousel-slides');
const slides         = document.querySelectorAll('.carousel-slide');
const carouselDots   = document.getElementById('carousel-dots');
let currentIndex = 0;
let slideInterval;

slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'carousel-dot';
    dot.addEventListener('click', () => goToSlide(i));
    carouselDots.appendChild(dot);
});

function updateDots() {
    document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIndex);
    });
}

function goToSlide(index) {
    currentIndex = (index + slides.length) % slides.length;
    carouselSlides.style.transform = `translateX(-${currentIndex * 100}%)`;
    updateDots();
    restartSlideInterval();
}

function startSlideInterval()   { slideInterval = setInterval(() => goToSlide(currentIndex + 1), 5000); }
function restartSlideInterval() { clearInterval(slideInterval); startSlideInterval(); }

document.getElementById('carousel-next').addEventListener('click', () => goToSlide(currentIndex + 1));
document.getElementById('carousel-prev').addEventListener('click', () => goToSlide(currentIndex - 1));

const carouselContainer = document.querySelector('.carousel-container');
carouselContainer.addEventListener('mouseenter', () => clearInterval(slideInterval));
carouselContainer.addEventListener('mouseleave', startSlideInterval);

// ── 今日进度条 ─────────────────────────────────────────────────
function updateTodayProgress() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const elapsed = now - startOfDay;
    const total = 24 * 60 * 60 * 1000;
    const pct = Math.min(100, Math.round((elapsed / total) * 100));
    document.getElementById('progress-percent').textContent = pct + '%';
    document.getElementById('progress-fill').style.width = pct + '%';

    // 本周进度（周一 0:00 → 周日 24:00）
    const dow = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const mondayBased = dow === 0 ? 6 : dow - 1; // 0=Mon, ..., 6=Sun
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayBased);
    const weekElapsed = now - startOfWeek;
    const weekTotal = 7 * 24 * 60 * 60 * 1000;
    const weekPct = Math.min(100, Math.round((weekElapsed / weekTotal) * 100));
    document.getElementById('week-percent').textContent = weekPct + '%';
    document.getElementById('week-fill').style.width = weekPct + '%';
}

// ── 初始化 ───────────────────────────────────────────────────
updateDots();
startSlideInterval();
initYearMonthSelectors();  // 内部先立即渲染，再等 API 返回后重渲染
WeatherCard.fetchWeather(); // 天气（上海嘉定，Open-Meteo 免费 API）
updateClock();
updateCountdown();
updateTodayProgress();
setInterval(updateClock, 1000);
setInterval(updateCountdown, 1000);
setInterval(updateTodayProgress, 1000);
setInterval(updateMemorialCountdown, 1000);
