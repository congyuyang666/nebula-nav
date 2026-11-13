/* Nebula Nav · 前台交互
   数据来自 /api/config，模式与最近访问保存在本机 localStorage。 */
(function () {
  'use strict';

  const els = {
    gate: document.getElementById('gate'),
    gateForm: document.getElementById('gateForm'),
    gatePassword: document.getElementById('gatePassword'),
    gateError: document.getElementById('gateError'),
    gateSubmit: document.getElementById('gateSubmit'),
    gateTitle: document.getElementById('gateTitle'),
    gateVersion: document.getElementById('gateVersion'),
    shell: document.getElementById('shell'),
    themeSelect: document.getElementById('themeSelect'),
    modeSwitch: document.getElementById('modeSwitch'),
    densityBtn: document.getElementById('densityBtn'),
    densityLabel: document.getElementById('densityLabel'),
    collapseAll: document.getElementById('collapseAll'),
    lockBtn: document.getElementById('lockBtn'),
    searchInput: document.getElementById('searchInput'),
    engineSelect: document.getElementById('engineSelect'),
    searchMeta: document.getElementById('searchMeta'),
    clearSearch: document.getElementById('clearSearch'),
    filterBar: document.getElementById('filterBar'),
    content: document.getElementById('content'),
    brandName: document.getElementById('brandName'),
    brandSub: document.getElementById('brandSub'),
    clock: document.getElementById('clock'),
    welcome: document.getElementById('welcome'),
    greetingText: document.getElementById('greetingText'),
    quoteText: document.getElementById('quoteText'),
    footerLeft: document.getElementById('footerLeft'),
    footerRight: document.getElementById('footerRight'),
    monitor: document.getElementById('monitor'),
    monitorGrid: document.getElementById('monitorGrid'),
    monitorCpu: document.getElementById('monitorCpu'),
    monitorCores: document.getElementById('monitorCores'),
    monitorCpuBar: document.getElementById('monitorCpuBar'),
    monitorCpuVal: document.getElementById('monitorCpuVal'),
    monitorMem: document.getElementById('monitorMem'),
    monitorMemBar: document.getElementById('monitorMemBar'),
    monitorMemVal: document.getElementById('monitorMemVal'),
    monitorFoot: document.getElementById('monitorFoot')
  };

  /* 内置短句，避免请求外部接口（CSP 只允许本站脚本与请求） */
  const QUOTES = [
    '把常用的入口放在手边，剩下的交给时间。',
    '慢一点，也是在往前走。',
    '愿今天的网络稳定，心情也一样。',
    '保持好奇，也保持备份。',
    '生活不是待办清单，偶尔也要划掉几行。',
    '把喜欢的东西放在看得见的地方。',
    '好好吃饭，好好睡觉，好好备份。',
    '山高路远，先把手头这件小事做好。',
    '不必事事完美，先让它跑起来。',
    '晴带雨伞，饱带干粮，重要数据多备份。',
    '今天也要给自己留一点空白。',
    '世界很大，先从这里出发。',
    '安静的时候，最适合整理自己的收藏。',
    '一件事做久了，就成了习惯。'
  ];

  const state = {
    settings: null,
    categories: [],
    items: [],
    mode: 'lan',
    activeCategory: 'all',
    query: '',
    collapsed: readJSON('aurora.collapsed', {}),
    recent: readJSON('aurora.recent', []),
    density: readJSON('aurora.density', 'standard')
  };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 忽略存储失败 */ }
  }

  function api(path, options) {
    return fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options
    }).then((res) => {
      if (res.status === 401) {
        const err = new Error('unauthorized');
        err.status = 401;
        throw err;
      }
      return res.json().then((body) => {
        if (!res.ok) {
          const err = new Error(body && body.error ? body.error : '请求失败');
          err.status = res.status;
          throw err;
        }
        return body;
      });
    });
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ------------------------------------------------------- 问候语与时钟 */

  function greetingByHour(hour) {
    if (hour >= 5 && hour <= 10) return '早上好';
    if (hour >= 11 && hour <= 12) return '中午好';
    if (hour >= 13 && hour <= 17) return '下午好';
    if (hour >= 18 && hour <= 22) return '晚上好';
    return '夜深了';
  }

  let quoteIndex = -1;

  function nextQuote() {
    if (!QUOTES.length) return '';
    let next = quoteIndex;
    while (next === quoteIndex) next = Math.floor(Math.random() * QUOTES.length);
    quoteIndex = next;
    return QUOTES[quoteIndex];
  }

  function renderWelcome(settings) {
    if (!els.greetingText) return;
    const custom = String((settings && settings.greeting) || '').trim();
    els.greetingText.textContent = custom || greetingByHour(new Date().getHours());
    if (els.quoteText) {
      els.quoteText.hidden = settings && settings.showQuote === false;
      els.quoteText.textContent = nextQuote();
    }
  }

  let clockTimer = 0;
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function startClock(settings) {
    if (!els.clock) return;
    els.clock.hidden = settings && settings.showClock === false;
    let timeEl = els.clock.querySelector('.clock-time');
    let dateEl = els.clock.querySelector('.clock-date');
    if (!timeEl || !dateEl) {
      els.clock.textContent = '';
      timeEl = document.createElement('span');
      timeEl.className = 'clock-time';
      dateEl = document.createElement('span');
      dateEl.className = 'clock-date';
      els.clock.append(timeEl, dateEl);
    }
    const tick = () => {
      const now = new Date();
      timeEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      dateEl.textContent = `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAYS[now.getDay()]}`;
    };
    tick();
    if (!clockTimer) clockTimer = setInterval(tick, 10000);
  }

  /* ------------------------------------------------------- 系统监控 */

  function formatBytes(bytes) {
    if (bytes == null || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
  }

  function formatSpeed(bps) {
    if (bps == null || bps <= 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let i = 0;
    let v = bps;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
  }

  let monitorTimer = 0;
  let monitorSeq = 0;

  /* 已经渲染过的磁盘卡片（按 path 缓存） */
  const diskCards = {};
  const diskSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><ellipse cx="12" cy="6.5" rx="8.5" ry="3.2"></ellipse><path d="M3.5 6.5V17c0 1.8 3.8 3.2 8.5 3.2s8.5-1.4 8.5-3.2V6.5" stroke-linejoin="round"></path><path d="M3.5 11c0 1.8 3.8 3.2 8.5 3.2s8.5-1.4 8.5-3.2" stroke-linejoin="round"></path></svg>';

  function renderDiskCard(disk) {
    let card = diskCards[disk.path];
    if (!card) {
      card = document.createElement('div');
      card.className = 'monitor-card monitor-disk';
      card.innerHTML = `
        <div class="monitor-card-head">${diskSvg}<span class="monitor-disk-label"></span></div>
        <div class="monitor-bar"><div class="monitor-bar-fill"></div></div>
        <div class="monitor-num"></div>`;
      els.monitorGrid.appendChild(card);
      diskCards[disk.path] = card;
    }
    const bar = card.querySelector('.monitor-bar-fill');
    const num = card.querySelector('.monitor-num');
    const label = card.querySelector('.monitor-disk-label');
    label.textContent = disk.label || disk.path;
    card.title = disk.path + ' · 已用 ' + formatBytes(disk.used) + ' / 总共 ' + formatBytes(disk.total);
    bar.style.width = Math.min(100, disk.usage) + '%';
    num.textContent = formatBytes(disk.used) + ' / ' + formatBytes(disk.total);
    card.classList.toggle('is-hot', disk.usage > 90);
  }

  function renderMonitor(data) {
    if (!data) return;
    if (els.monitorCores && data.cpuCores) els.monitorCores.textContent = data.cpuCores + ' 核';

    // CPU
    if (data.cpuUsage != null) {
      els.monitorCpuBar.style.width = Math.min(100, data.cpuUsage) + '%';
      els.monitorCpuVal.textContent = data.cpuUsage.toFixed(1) + '%';
      els.monitorCpu.classList.toggle('is-hot', data.cpuUsage > 80);
    } else {
      els.monitorCpuBar.style.width = '0%';
      els.monitorCpuVal.textContent = '采样中…';
    }

    // 内存
    if (data.memory) {
      els.monitorMemBar.style.width = Math.min(100, data.memory.usage) + '%';
      els.monitorMemVal.textContent = formatBytes(data.memory.used) + ' / ' + formatBytes(data.memory.total);
      els.monitorMem.classList.toggle('is-hot', data.memory.usage > 85);
    }

    // 磁盘（动态多个）
    if (Array.isArray(data.disks)) {
      // 清理已移除的磁盘卡片
      const seen = new Set(data.disks.map(d => d.path));
      Object.keys(diskCards).forEach((p) => {
        if (!seen.has(p)) { diskCards[p].remove(); delete diskCards[p]; }
      });
      data.disks.forEach(renderDiskCard);
    }

    // 底部：主机名 + 运行时长
    if (els.monitorFoot) {
      const uptime = data.uptime ? Math.floor(data.uptime / 3600) : 0;
      els.monitorFoot.textContent = (data.hostname || '') + ' · 运行 ' + uptime + 'h · 更新 ' + new Date().toLocaleTimeString('zh-CN');
    }
  }

  async function fetchSystemStatus() {
    const seq = ++monitorSeq;
    try {
      const data = await api('/api/system');
      if (seq === monitorSeq) renderMonitor(data);
    } catch { /* 网络错误就默默跳过，等下次 */ }
  }

  function startMonitor(settings) {
    if (!els.monitor) return;
    els.monitor.hidden = settings && settings.showMonitor === false;
    if (els.monitor.hidden) return;
    fetchSystemStatus();
    if (monitorTimer) clearInterval(monitorTimer);
    monitorTimer = setInterval(fetchSystemStatus, 10000);
  }


  function applyTheme(theme) {
    const active = theme || 'nebula';
    document.documentElement.dataset.theme = active;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if (bg) meta.content = bg;
    }
    const scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.content = (active === 'dawn' || active === 'paper') ? 'light' : 'dark';
  }

  /* 前台主题偏好：只存在当前浏览器，优先于后台的站点默认主题 */
  const THEME_KEY = 'aurora.theme';

  function readThemePref() {
    try {
      return localStorage.getItem(THEME_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function writeThemePref(value) {
    try {
      if (value) localStorage.setItem(THEME_KEY, value);
      else localStorage.removeItem(THEME_KEY);
    } catch (e) { /* 忽略存储失败 */ }
  }

  function effectiveTheme(defaultTheme) {
    return readThemePref() || defaultTheme || 'nebula';
  }

  function isPrivateHostname(hostname) {    const h = String(hostname || '').toLowerCase();
    if (!h) return true;
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.lan')) return true;
    if (/^10\./.test(h) || /^192\.168\./.test(h) || /^127\./.test(h)) return true;
    const m = h.match(/^172\.(\d+)\./);
    return Boolean(m && Number(m[1]) >= 16 && Number(m[1]) <= 31);
  }

  function effectiveMode() {
    if (state.mode === 'auto') return isPrivateHostname(location.hostname) ? 'lan' : 'wan';
    return state.mode;
  }

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch (e) {
      return '';
    }
  }

  function resolveUrl(item) {
    const lan = item.urlLan || '';
    const wan = item.urlWan || '';
    if (!lan && !wan) return { url: '', fallback: '' };
    if (effectiveMode() === 'lan') {
      if (lan) return { url: lan, fallback: '' };
      return { url: wan, fallback: '公网' };
    }
    if (wan) return { url: wan, fallback: '' };
    return { url: lan, fallback: '内网' };
  }

  function categoryOf(id) {
    return state.categories.find((c) => c.id === id) || { id: 'misc', name: '其他', color: '#8FA0B8' };
  }

  /* ------------------------------------------------------------ 密码门禁 */

  els.gateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = els.gatePassword.value;
    if (!password) {
      els.gateError.textContent = '请输入访问密码';
      return;
    }
    els.gateSubmit.disabled = true;
    els.gateError.textContent = '';
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
      els.gatePassword.value = '';
      await boot();
    } catch (err) {
      els.gateError.textContent = err.message === 'unauthorized' ? '密码不正确' : (err.message || '登录失败');
      els.gatePassword.focus();
    } finally {
      els.gateSubmit.disabled = false;
    }
  });

  /* -------------------------------------------------------------- 渲染 */

  function renderFilterBar() {
    els.filterBar.textContent = '';
    const total = state.items.length;
    const all = chip('全部', '#8FA0B8', total, 'all');
    els.filterBar.appendChild(all);
    state.categories.forEach((cat) => {
      const count = state.items.filter((i) => i.category === cat.id).length;
      if (!count) return;
      els.filterBar.appendChild(chip(cat.name, cat.color, count, cat.id));
    });
  }

  function chip(name, color, count, id) {
    const btn = el('button', 'chip');
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(state.activeCategory === id));
    btn.style.setProperty('--c', color);
    btn.dataset.category = id;
    const dot = el('span', 'dot');
    btn.appendChild(dot);
    btn.appendChild(el('span', null, name));
    btn.appendChild(el('span', 'section-count', String(count)));
    return btn;
  }

  function makeIcon(item, host) {
    const cat = categoryOf(item.category);
    const tile = el('span', 'card-icon is-letter');
    tile.style.setProperty('--c', cat.color);
    const letter = el('span', 'letter', (item.title || '?').trim().charAt(0));
    tile.appendChild(letter);

    // 自定义图标优先；否则交给服务器的图标代理去抓站点 favicon，失败时退回首字母
    const iconUrl = item.icon || (host ? `/api/favicon?host=${encodeURIComponent(host)}` : '');
    const isCustom = Boolean(item.icon);
    if (iconUrl) {
      tile.classList.remove('is-letter');
      if (isCustom) tile.classList.add('is-custom');
      const img = el('img');
      img.src = iconUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.remove();
        tile.classList.add('is-letter');
      });
      // 深色底上，纯黑单色的 favicon 会看不见：采样判断亮度后反相
      img.addEventListener('load', () => {
        if (isCustom) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 16;
          canvas.height = 16;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, 16, 16);
          const pixels = ctx.getImageData(0, 0, 16, 16).data;
          let luminance = 0;
          let opaque = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const alpha = pixels[i + 3] / 255;
            if (alpha > 0.25) {
              opaque += 1;
              luminance += (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) * alpha;
            }
          }
          if (opaque && luminance / opaque < 78 && opaque / 256 > 0.3) {
            img.classList.add('on-dark');
          }
        } catch (e) { /* 跨域或空图时忽略 */ }
      });
      tile.appendChild(img);
    }
    return tile;
  }

  function makeCard(item, compact) {
    const resolved = resolveUrl(item);
    const host = hostOf(resolved.url || item.urlLan || item.urlWan);
    const cat = categoryOf(item.category);
    const card = document.createElement(resolved.url ? 'a' : 'div');
    card.className = 'card';
    card.style.setProperty('--c', cat.color);
    if (resolved.url) {
      card.href = resolved.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.addEventListener('click', () => remember(item.id));
    } else {
      card.classList.add('is-disabled');
      card.style.opacity = '0.6';
    }
    card.appendChild(makeIcon(item, host));

    const body = el('span', 'card-body');
    body.appendChild(el('span', 'card-name', item.title));
    if (!compact && item.desc) body.appendChild(el('span', 'card-desc', item.desc));
    body.appendChild(el('span', 'card-host', host || '未配置地址'));
    card.appendChild(body);

    if (resolved.fallback) {
      card.appendChild(el('span', 'card-badge', resolved.fallback));
    }
    card.title = [item.title, item.desc, item.tags && item.tags.length ? '标签：' + item.tags.join('、') : '']
      .filter(Boolean).join('\n');
    return card;
  }

  function sectionHead(name, color, count, collapsible, key) {
    const head = el('div', 'section-head');
    head.style.setProperty('--c', color);
    const title = el('h2', 'section-title');
    title.appendChild(el('span', 'bar'));
    title.appendChild(el('span', null, name));
    head.appendChild(title);
    head.appendChild(el('span', 'section-count', `${count} 个`));
    head.appendChild(el('span', 'section-spacer'));
    if (collapsible) {
      const btn = el('button', 'section-toggle');
      btn.type = 'button';
      btn.setAttribute('aria-label', `折叠${name}`);
      btn.innerHTML = '';
      const icon = document.createElement('span');
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6" stroke-linecap="round"></path></svg>';
      btn.appendChild(icon.firstChild);
      btn.appendChild(el('span', null, '折叠'));
      btn.addEventListener('click', () => {
        state.collapsed[key] = !state.collapsed[key];
        writeJSON('aurora.collapsed', state.collapsed);
        renderContent();
      });
      head.appendChild(btn);
    }
    return head;
  }

  function buildSection(key, name, color, items, opts) {
    const collapsed = Boolean(state.collapsed[key]);
    const section = el('section', 'section' + (collapsed ? ' collapsed' : ''));
    const head = sectionHead(name, color, items.length, !opts || opts.collapsible !== false, key);
    section.appendChild(head);
    const cards = el('div', 'cards');
    items.forEach((item) => cards.appendChild(makeCard(item, opts && opts.compact)));
    section.appendChild(cards);
    return section;
  }

  function renderContent() {
    els.content.textContent = '';
    syncCollapseAll();
    const query = state.query.trim().toLowerCase();
    const catFilter = state.activeCategory;

    let pool = state.items.filter((item) => {
      if (catFilter !== 'all' && item.category !== catFilter) return false;
      if (!query) return true;
      const hay = [item.title, item.desc, (item.tags || []).join(' '), hostOf(item.urlLan), hostOf(item.urlWan)]
        .join(' ').toLowerCase();
      return hay.includes(query);
    });

    if (query) {
      const section = buildSection('search', `搜索「${state.query.trim()}」`, '#4BE1C0', pool, { collapsible: false });
      els.content.appendChild(section);
      updateMeta(pool.length);
      return;
    }

    const recentItems = state.recent
      .map((id) => state.items.find((i) => i.id === id))
      .filter(Boolean)
      .filter((item) => catFilter === 'all' || item.category === catFilter);
    if (recentItems.length && catFilter === 'all' && !(state.settings && state.settings.showRecent === false)) {
      els.content.appendChild(buildSection('recent', '最近访问', '#8FA0B8', recentItems, { collapsible: false, compact: true }));
    }

    if (catFilter === 'all') {
      const showPinned = !(state.settings && state.settings.showPinned === false);
      const pinned = showPinned ? pool.filter((i) => i.pinned) : [];
      if (pinned.length) {
        els.content.appendChild(buildSection('pinned', '常用', '#4BE1C0', pinned, { collapsible: false }));
      }
      state.categories.forEach((cat) => {
        const items = pool.filter((i) => i.category === cat.id);
        if (!items.length) return;
        els.content.appendChild(buildSection(cat.id, cat.name, cat.color, items));
      });
      const rest = pool.filter((i) => !state.categories.some((c) => c.id === i.category));
      if (rest.length) els.content.appendChild(buildSection('other', '未分类', '#8FA0B8', rest));
    } else {
      const cat = categoryOf(catFilter);
      els.content.appendChild(buildSection(cat.id, cat.name, cat.color, pool, { collapsible: false }));
    }

    if (!pool.length) {
      const empty = el('div', 'empty');
      empty.appendChild(el('strong', null, query ? '没有匹配的站点' : '这个分类还没有站点'));
      empty.appendChild(el('p', null, query ? '换个关键词，或清空搜索再看全部。' : '到后台「网址管理」里添加，或先浏览其他分类。'));
      els.content.appendChild(empty);
    }
    updateMeta(pool.length);
  }

  function updateMeta(count) {
    const modeLabel = effectiveMode() === 'lan' ? '内网' : '公网';
    const modeSuffix = state.mode === 'auto' ? `自动识别为${modeLabel}` : modeLabel;
    els.searchMeta.textContent = `${modeSuffix} · ${count} / ${state.items.length} 个站点`;
    els.clearSearch.hidden = !state.query;
  }

  /* ------------------------------------------------------- 密度与折叠 */

  function applyDensity() {
    const compact = state.density === 'compact';
    document.body.classList.toggle('density-compact', compact);
    els.densityBtn.setAttribute('aria-pressed', String(compact));
    els.densityLabel.textContent = compact ? '紧凑' : '标准';
  }

  function syncCollapseAll() {
    const ids = state.categories.map((c) => c.id);
    const anyOpen = ids.some((id) => !state.collapsed[id]);
    els.collapseAll.textContent = anyOpen ? '全部折叠' : '全部展开';
    els.collapseAll.hidden = !ids.length;
  }

  function remember(id) {
    const list = state.recent.filter((x) => x !== id);
    list.unshift(id);
    state.recent = list.slice(0, 6);
    writeJSON('aurora.recent', state.recent);
  }

  /* ---------------------------------------------------------- 交互绑定 */

  els.modeSwitch.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-mode]');
    if (!btn) return;
    state.mode = btn.dataset.mode;
    writeJSON('aurora.mode', state.mode);
    syncModeButtons();
    renderContent();
  });

  els.densityBtn.addEventListener('click', () => {
    state.density = state.density === 'compact' ? 'standard' : 'compact';
    writeJSON('aurora.density', state.density);
    applyDensity();
  });

  function syncThemeSelect() {
    if (els.themeSelect) els.themeSelect.value = readThemePref();
  }

  if (els.themeSelect) {
    els.themeSelect.addEventListener('change', () => {
      writeThemePref(els.themeSelect.value);
      applyTheme(effectiveTheme(state.settings ? state.settings.theme : 'nebula'));
    });
  }

  if (els.quoteText) {
    els.quoteText.addEventListener('click', () => {
      els.quoteText.textContent = nextQuote();
    });
  }

  els.collapseAll.addEventListener('click', () => {
    const ids = state.categories.map((c) => c.id);
    if (!ids.length) return;
    const anyOpen = ids.some((id) => !state.collapsed[id]);
    ids.forEach((id) => { state.collapsed[id] = anyOpen; });
    writeJSON('aurora.collapsed', state.collapsed);
    renderContent();
  });

  function syncModeButtons() {
    els.modeSwitch.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.mode));
    });
  }

  els.filterBar.addEventListener('click', (event) => {
    const btn = event.target.closest('.chip');
    if (!btn) return;
    state.activeCategory = btn.dataset.category;
    renderFilterBar();
    renderContent();
  });

  /* ------------------------------------------------------- 搜索引擎 */

  const BUILTIN_ENGINES = [
    { id: 'local', name: '站内' },
    { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
    { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' }
  ];
  let engineMap = {};

  function renderEngines(settings) {
    const sel = els.engineSelect;
    if (!sel) return;
    const custom = Array.isArray(settings.searchEngines) ? settings.searchEngines : [];
    engineMap = {};
    sel.textContent = '';
    BUILTIN_ENGINES.forEach((engine) => {
      engineMap[engine.id] = engine;
      const opt = document.createElement('option');
      opt.value = engine.id;
      opt.textContent = engine.name;
      sel.appendChild(opt);
    });
    custom.forEach((engine, index) => {
      const id = `c${index}`;
      engineMap[id] = { id, name: engine.name, url: engine.url };
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = engine.name;
      sel.appendChild(opt);
    });
    const want = settings.defaultEngine || 'local';
    sel.value = engineMap[want] ? want : 'local';
    syncSearchHint();
  }

  function currentEngine() {
    const id = els.engineSelect ? els.engineSelect.value : 'local';
    return engineMap[id] || engineMap.local;
  }

  function syncSearchHint() {
    const engine = currentEngine();
    if (!els.searchInput) return;
    els.searchInput.placeholder = engine && engine.id !== 'local'
      ? `用 ${engine.name} 搜索，回车在新标签页打开`
      : '搜索站点、描述或域名';
  }

  if (els.engineSelect) els.engineSelect.addEventListener('change', syncSearchHint);

  let searchTimer = 0;
  els.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.searchInput.value;
      renderContent();
    }, 90);
  });

  els.clearSearch.addEventListener('click', () => {
    els.searchInput.value = '';
    state.query = '';
    renderContent();
    els.searchInput.focus();
  });

  // 回车：站内模式打开第一个匹配；选了 Bing / Google / 自定义则直接搜索
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const keyword = els.searchInput.value.trim();
    const engine = currentEngine();
    if (engine && engine.id !== 'local') {
      if (!keyword) return;
      window.open(engine.url.replace('%s', encodeURIComponent(keyword)), '_blank', 'noopener');
      return;
    }
    const first = els.content.querySelector('.card[href]');
    if (first) window.open(first.href, '_blank', 'noopener');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      event.preventDefault();
      els.searchInput.focus();
    }
    if (event.key === 'Escape' && document.activeElement === els.searchInput) {
      els.searchInput.value = '';
      state.query = '';
      renderContent();
    }
  });

  els.lockBtn.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* 忽略 */ }
    location.reload();
  });

  /* -------------------------------------------------------------- 启动 */

  async function boot() {
    els.gate.classList.add('hidden');
    els.shell.hidden = false;
    const config = await api('/api/config');
    state.settings = config.settings;
    state.categories = config.categories;
    state.items = config.items;
    applyTheme(effectiveTheme(config.settings.theme));
    syncThemeSelect();

    els.brandName.textContent = config.settings.siteTitle || 'Nebula Nav';
    els.brandSub.textContent = config.settings.siteSubtitle || '';
    els.gateTitle.textContent = config.settings.siteTitle || 'Nebula Nav';
    document.title = `${config.settings.siteTitle || 'Nebula Nav'} · 导航`;
    els.footerLeft.textContent = config.settings.footerNote || config.settings.siteTitle || 'Nebula Nav';
    els.footerRight.textContent = [
      config.updatedAt ? `数据更新于 ${new Date(config.updatedAt).toLocaleString('zh-CN')}` : '',
      config.settings.version ? `v${config.settings.version}` : ''
    ].filter(Boolean).join(' · ');

    const savedMode = readJSON('aurora.mode', null);
    state.mode = ['auto', 'lan', 'wan'].includes(savedMode) ? savedMode : (config.settings.defaultMode || 'lan');
    els.modeSwitch.hidden = config.settings.showModeSwitch === false;
    renderWelcome(config.settings);
    startClock(config.settings);
    renderEngines(config.settings);
    startMonitor(config.settings);
    applyDensity();
    syncModeButtons();
    renderFilterBar();
    renderContent();
    // 首屏卡片做一次轻量淡入，之后筛选/搜索不再重放
    els.content.classList.add('is-first');
    setTimeout(() => els.content.classList.remove('is-first'), 700);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!secure) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 注册失败不影响使用 */ });
  }

  async function init() {
    registerSW();
    try {
      const status = await api('/api/auth/status');
      els.gateTitle.textContent = status.siteTitle || 'Nebula Nav';
      applyTheme(effectiveTheme(status.theme));
      syncThemeSelect();
      if (status.version) els.gateVersion.textContent = ` · v${status.version}`;
      if (status.role) {
        await boot();
      } else {
        els.gatePassword.focus();
      }
    } catch (e) {
      els.gateError.textContent = '无法连接服务器，请确认服务已启动。';
    }
  }

  init();
})();
