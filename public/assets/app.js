/* Aurora Nav · 前台交互
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
    shell: document.getElementById('shell'),
    modeSwitch: document.getElementById('modeSwitch'),
    lockBtn: document.getElementById('lockBtn'),
    searchInput: document.getElementById('searchInput'),
    searchMeta: document.getElementById('searchMeta'),
    clearSearch: document.getElementById('clearSearch'),
    filterBar: document.getElementById('filterBar'),
    content: document.getElementById('content'),
    brandName: document.getElementById('brandName'),
    brandSub: document.getElementById('brandSub'),
    footerLeft: document.getElementById('footerLeft'),
    footerRight: document.getElementById('footerRight')
  };

  const state = {
    settings: null,
    categories: [],
    items: [],
    mode: 'lan',
    activeCategory: 'all',
    query: '',
    collapsed: readJSON('aurora.collapsed', {}),
    recent: readJSON('aurora.recent', [])
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

  function isPrivateHostname(hostname) {
    const h = String(hostname || '').toLowerCase();
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
    if (iconUrl) {
      tile.classList.remove('is-letter');
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
    if (recentItems.length && catFilter === 'all') {
      els.content.appendChild(buildSection('recent', '最近访问', '#8FA0B8', recentItems, { collapsible: false, compact: true }));
    }

    if (catFilter === 'all') {
      const pinned = pool.filter((i) => i.pinned);
      if (pinned.length) {
        els.content.appendChild(buildSection('pinned', '常用', '#4BE1C0', pinned, { collapsible: false }));
      }
      state.categories.forEach((cat) => {
        const items = pool.filter((i) => i.category === cat.id && !i.pinned);
        if (!items.length) return;
        els.content.appendChild(buildSection(cat.id, cat.name, cat.color, items));
      });
      const rest = pool.filter((i) => i.pinned === false && !state.categories.some((c) => c.id === i.category));
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

    els.brandName.textContent = config.settings.siteTitle || 'Aurora Nav';
    els.brandSub.textContent = config.settings.siteSubtitle || '';
    els.gateTitle.textContent = config.settings.siteTitle || 'Aurora Nav';
    document.title = `${config.settings.siteTitle || 'Aurora Nav'} · 导航`;
    els.footerLeft.textContent = config.settings.footerNote || config.settings.siteTitle || 'Aurora Nav';
    els.footerRight.textContent = config.updatedAt ? `数据更新于 ${new Date(config.updatedAt).toLocaleString('zh-CN')}` : '';

    const savedMode = readJSON('aurora.mode', null);
    state.mode = ['auto', 'lan', 'wan'].includes(savedMode) ? savedMode : (config.settings.defaultMode || 'lan');
    els.modeSwitch.hidden = config.settings.showModeSwitch === false;
    syncModeButtons();
    renderFilterBar();
    renderContent();
  }

  async function init() {
    try {
      const status = await api('/api/auth/status');
      els.gateTitle.textContent = status.siteTitle || 'Aurora Nav';
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
