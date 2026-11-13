/* Nebula Nav · 后台交互
   草稿模型：分类 / 网址 / 外观与背景先改在内存里，点「保存修改」才写回服务器。 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const ICON_SVG = {
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="6" width="16" height="12" rx="2"></rect><path d="M4 9.5h16M4 14.5h16M9 6v3.5M15 6v3.5M9 14.5V18M15 14.5V18"></path></svg>',
    drive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="14" width="16" height="5" rx="1.8"></rect><path d="M5.5 14 8 5h8l2.5 9M7.5 16.5h.01M17 16.5h.01" stroke-linecap="round"></path></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m9 8-4 4 4 4M15 8l4 4-4 4" stroke-linecap="round"></path></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.6 6.6l2.1 2.1M15.3 15.3l2.1 2.1M17.4 6.6l-2.1 2.1M8.7 15.3l-2.1 2.1" stroke-linecap="round"></path><circle cx="12" cy="12" r="2.6"></circle></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 5.5h5.2A2 2 0 0 1 12 6.8v12a1.5 1.5 0 0 0-1.5-1.5H5V5.5ZM19 5.5h-5.2A2 2 0 0 0 12 6.8v12a1.5 1.5 0 0 1 1.5-1.5H19V5.5Z" stroke-linejoin="round"></path></svg>',
    flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="6" height="5" rx="1.4"></rect><rect x="14" y="15" width="6" height="5" rx="1.4"></rect><path d="M7 9v5.5A2.5 2.5 0 0 0 9.5 17H14" stroke-linecap="round"></path></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="6.5" height="6.5" rx="1.4"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"></rect></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m12 4.5 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8 2.4-4.9Z" stroke-linejoin="round"></path></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9.5 14.5 14.5 9.5M8 16a4 4 0 0 1 0-5.7l2.2-2.2a4 4 0 0 1 5.7 5.7L14.5 15M16 8a4 4 0 0 1 5.7 5.7L19.5 16a4 4 0 0 1-7.7 1.3" stroke-linecap="round"></path></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3.5 5 6.2v5.1c0 4.2 2.9 7.4 7 9.2 4.1-1.8 7-5 7-9.2V6.2L12 3.5Z" stroke-linejoin="round"></path></svg>'
  };
  const ICON_LABEL = {
    film: '影音', drive: '存储', code: '代码', spark: 'AI', book: '阅读',
    flow: '流程', grid: '网格', star: '星标', link: '链接', shield: '盾牌'
  };
  const ICON_NAMES = Object.keys(ICON_SVG);

  const state = {
    settings: null,
    categories: [],
    items: [],
    vaultEntries: [],
    vaultCount: 0,
    vaultToken: '',
    updatedAt: null,
    saved: '',
    dirty: false,
    editingItemId: null,
    editingVaultId: null,
    siteQuery: '',
    vaultQuery: '',
    panel: 'settings'
  };

  /* -------------------------------------------------------------- 工具 */

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function iconSvg(name) {
    const key = ICON_SVG[name] ? name : 'grid';
    return ICON_SVG[key];
  }

  let toastTimer = 0;
  function toast(message, isError) {
    const box = $('toast');
    box.textContent = message;
    box.classList.toggle('error', Boolean(isError));
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 2600);
  }

  function api(path, options) {
    return fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options
    }).then((res) =>
      res.json().catch(() => ({})).then((body) => {
        if (!res.ok) {
          const err = new Error((body && body.error) || '请求失败');
          err.status = res.status;
          throw err;
        }
        return body;
      })
    );
  }

  function snapshot() {
    return JSON.stringify({
      settings: state.settings,
      categories: state.categories,
      items: state.items
    });
  }

  function markDirty() {
    state.dirty = snapshot() !== state.saved;
    updateSaveState();
  }

  function updateSaveState() {
    const label = $('saveState');
    if (state.dirty) {
      label.textContent = '有未保存的修改';
      label.classList.add('dirty');
    } else {
      label.textContent = '没有未保存的修改';
      label.classList.remove('dirty');
    }
    $('saveBtn').disabled = !state.dirty;
    $('saveBtn').style.opacity = state.dirty ? '1' : '0.55';
  }

  function newId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch (e) {
      return String(url || '');
    }
  }

  /* 添加网址时允许只填 192.168.1.10:8080，自动补上 http:// */
  function ensureScheme(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
    return `http://${v}`;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme || 'nebula';
  }

  /* -------------------------------------------------------------- 启动 */

  async function init() {
    try {
      const status = await api('/api/auth/status');
      applyTheme(status.theme);
      if (status.role === 'admin') {
        await loadAdmin();
      } else {
        $('adminLogin').hidden = false;
        $('adminUser').focus();
      }
    } catch (e) {
      $('adminLogin').hidden = false;
      $('adminLoginError').textContent = '无法连接服务器，请确认服务已启动。';
    }
  }

  $('adminLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = $('adminLoginBtn');
    const username = $('adminUser').value.trim();
    const password = $('adminPass').value;
    $('adminLoginError').textContent = '';
    btn.disabled = true;
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      await loadAdmin();
    } catch (err) {
      $('adminLoginError').textContent = err.message || '登录失败';
    } finally {
      btn.disabled = false;
    }
  });

  async function loadAdmin() {
    const data = await api('/api/admin/data');
    state.settings = data.settings;
    state.categories = data.categories;
    state.items = data.items;
    state.vaultCount = data.vaultCount || 0;
    state.updatedAt = data.updatedAt || null;
    state.saved = snapshot();
    state.dirty = false;
    $('adminLogin').hidden = true;
    $('adminShell').hidden = false;
    $('adminVersion').textContent = data.settings.version ? `v${data.settings.version}` : '—';
    bindSettings();
    renderCategories();
    renderSites();
    renderVaultLocked();
    updateStats();
    updateSaveState();
  }

  function updateStats() {
    $('statSites').textContent = String(state.items.length);
    $('statCats').textContent = String(state.categories.length);
    $('statPinned').textContent = String(state.items.filter((i) => i.pinned).length);
    $('statVault').textContent = String(state.vaultToken ? state.vaultEntries.length : state.vaultCount);
    $('statUpdated').textContent = state.updatedAt
      ? `数据最后更新于 ${new Date(state.updatedAt).toLocaleString('zh-CN')}`
      : '还没有保存过数据';
  }

  /* ------------------------------------------------------ 外观与背景 */

  function bindSettings() {
    $('setTitle').value = state.settings.siteTitle || '';
    $('setSubtitle').value = state.settings.siteSubtitle || '';
    $('setFooter').value = state.settings.footerNote || '';
    $('setGhRepo').value = state.settings.ghRepo || '';
    $('setIcp').value = state.settings.icp || '';
    $('setMode').value = state.settings.defaultMode || 'lan';
    $('setTheme').value = state.settings.theme || 'nebula';
    $('setCardStyle').value = state.settings.cardStyle || 'default';
    $('setShowMode').checked = state.settings.showModeSwitch !== false;
    $('setShowRecent').checked = state.settings.showRecent !== false;
    $('setShowPinned').checked = state.settings.showPinned !== false;
    $('setShowClock').checked = state.settings.showClock !== false;
    $('setShowQuote').checked = state.settings.showQuote !== false;
    $('setShowMonitor').checked = state.settings.showMonitor !== false;
    $('setGreeting').value = state.settings.greeting || '';
    $('setDiskPaths').value = state.settings.diskPaths || '/';
    $('setDeviceName').value = state.settings.deviceName || '';
    $('setDefaultEngine').value = state.settings.defaultEngine || 'local';
    initEngines();
    initGithub();
    applyTheme(state.settings.theme);
  }

  function readSettings() {
    const next = {
      siteTitle: $('setTitle').value.trim() || 'Nebula Nav',
      siteSubtitle: $('setSubtitle').value.trim(),
      footerNote: $('setFooter').value.trim(),
      ghRepo: $('setGhRepo').value.trim(),
      icp: $('setIcp').value.trim(),
      defaultMode: $('setMode').value,
      theme: $('setTheme').value,
      cardStyle: $('setCardStyle').value,
      showModeSwitch: $('setShowMode').checked,
      showRecent: $('setShowRecent').checked,
      showPinned: $('setShowPinned').checked,
      showClock: $('setShowClock').checked,
      showQuote: $('setShowQuote').checked,
      showMonitor: $('setShowMonitor').checked,
      greeting: $('setGreeting').value.trim(),
      diskPaths: $('setDiskPaths').value.trim(),
      deviceName: $('setDeviceName').value.trim(),
      defaultEngine: $('setDefaultEngine').value,
      searchEngines: collectEngines(),
    };
    state.settings = next;
  }

  ['setTitle', 'setSubtitle', 'setFooter', 'setMode', 'setShowMode',
    'setShowRecent', 'setShowPinned', 'setShowClock', 'setShowQuote',
    'setShowMonitor', 'setGreeting', 'setDiskPaths', 'setDeviceName',
    'setDefaultEngine'].forEach((id) => {
    $(id).addEventListener('input', () => { readSettings(); markDirty(); });
  });

  /* ------------------------------------------------------ 自定义搜索引擎 */

  let engineDraft = [];

  function initEngines() {
    engineDraft = Array.isArray(state.settings.searchEngines)
      ? state.settings.searchEngines.map((e) => ({ name: e.name || '', url: e.url || '' }))
      : [];
    renderEngineRows();
  }

  function renderEngineRows() {
    const list = $('engineList');
    list.textContent = '';
    if (!engineDraft.length) {
      list.appendChild(el('p', 'form-hint', '还没有自定义引擎，点下面「添加引擎」。'));
      return;
    }
    engineDraft.forEach((engine, index) => {
      const row = el('div', 'engine-row');

      const name = el('input', 'input-sm');
      name.value = engine.name;
      name.placeholder = '名称，如 DuckDuckGo';
      name.maxLength = 20;
      name.addEventListener('input', () => {
        engineDraft[index].name = name.value;
        readSettings();
        markDirty();
      });

      const url = el('input', 'input-sm');
      url.value = engine.url;
      url.placeholder = 'https://duckduckgo.com/?q=%s';
      url.addEventListener('input', () => {
        engineDraft[index].url = url.value;
        readSettings();
        markDirty();
      });

      const del = el('button', 'btn btn-danger btn-sm', '删除');
      del.type = 'button';
      del.addEventListener('click', () => {
        engineDraft.splice(index, 1);
        renderEngineRows();
        readSettings();
        markDirty();
      });

      row.appendChild(name);
      row.appendChild(url);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  function collectEngines() {
    return engineDraft
      .map((e) => ({ name: String(e.name || '').trim(), url: String(e.url || '').trim() }))
      .filter((e) => e.name && /^https?:\/\//i.test(e.url) && e.url.includes('%s'));
  }

  $('addEngine').addEventListener('click', () => {
    if (engineDraft.length >= 12) {
      toast('最多 12 个自定义引擎', true);
      return;
    }
    engineDraft.push({ name: '', url: '' });
    renderEngineRows();
    readSettings();
    markDirty();
  });

  /* ------------------------------------------------------ GitHub 同步 */

  function initGithub() {
    const g = state.settings.github || {};
    $('ghUsername').value = g.username || '';
    $('ghRepo').value = g.repo || '';
    $('ghBranch').value = g.branch || 'main';
    $('ghToken').value = ''; // 不回显真实 token
    $('ghToken').placeholder = g.tokenSet ? `已保存，末尾：${g.tokenTail}（留空不修改）` : '留空表示不修改已保存的 Token';
    $('ghEnabled').checked = g.enabled !== false;
    renderGhStatus(g);

    $('ghTest').addEventListener('click', async () => {
      const msg = $('ghMsg'); msg.textContent = '测试中...'; msg.style.color = '';
      try {
        const r = await api('/api/github/test', {
          method: 'POST',
          body: JSON.stringify({
            username: $('ghUsername').value.trim(),
            repo: $('ghRepo').value.trim(),
            branch: $('ghBranch').value.trim(),
            token: $('ghToken').value.trim() || undefined,
            tokenCipher: g.tokenCipher || undefined
          })
        });
        msg.textContent = r.ok ? `连接成功 ✓ 登录 ${r.login}，仓库 ${r.repo}` : `测试失败：${r.error}`;
        msg.style.color = r.ok ? 'var(--link)' : '#c04848';
      } catch (e) { msg.textContent = '网络错误: ' + e.message; msg.style.color = '#c04848'; }
    });

    $('ghSave').addEventListener('click', async () => {
      const payload = {
        username: $('ghUsername').value.trim(),
        repo: $('ghRepo').value.trim(),
        branch: $('ghBranch').value.trim() || 'main',
        enabled: $('ghEnabled').checked
      };
      const tokenVal = $('ghToken').value.trim();
      if (tokenVal) payload.token = tokenVal;
      // 留空 → 不修改；要清空单独走 Clear
      try {
        const r = await api('/api/github/save', { method: 'POST', body: JSON.stringify(payload) });
        if (r.ok) {
          state.settings.github = r.github;
          renderGhStatus(r.github);
          toast('GitHub 配置已保存');
          $('ghToken').value = '';
          $('ghToken').placeholder = r.github.tokenSet ? `已保存，末尾：${r.github.tokenTail}（留空不修改）` : '留空表示不修改已保存的 Token';
        } else {
          toast(r.error || '保存失败', true);
        }
      } catch (e) { toast('网络错误', true); }
    });

    $('ghPushNow').addEventListener('click', async () => {
      const msg = $('ghMsg'); msg.textContent = '正在推送...'; msg.style.color = '';
      try {
        const r = await api('/api/github/push', { method: 'POST' });
        if (r.ok) {
          msg.textContent = r.skipped ? `无需推送：${r.message}` : '已推送 ✓';
          msg.style.color = 'var(--link)';
          // 刷新状态
          const admin = await api('/api/admin/data');
          if (admin.settings?.github) { state.settings.github = admin.settings.github; renderGhStatus(admin.settings.github); }
        } else {
          msg.textContent = '推送失败：' + r.error; msg.style.color = '#c04848';
        }
      } catch (e) { msg.textContent = '网络错误: ' + e.message; msg.style.color = '#c04848'; }
    });

    $('ghClearToken').addEventListener('click', async () => {
      if (!confirm('确定清空已保存的 GitHub Token？')) return;
      try {
        const r = await api('/api/github/save', {
          method: 'POST',
          body: JSON.stringify({ username: $('ghUsername').value.trim(), repo: $('ghRepo').value.trim(), branch: $('ghBranch').value.trim() || 'main', token: null })
        });
        if (r.ok) {
          state.settings.github = r.github;
          renderGhStatus(r.github);
          toast('Token 已清除');
          $('ghToken').placeholder = '留空表示不修改已保存的 Token';
        }
      } catch (e) { toast('网络错误', true); }
    });
  }

  function renderGhStatus(g) {
    const chip = $('ghStateChip');
    const detail = $('ghStatusDetail');
    if (!g.username || !g.repo || !g.tokenSet) {
      chip.textContent = '未配置';
      chip.className = 'gh-chip gh-off';
      detail.textContent = '填写用户名、仓库、Token 并保存后生效';
      return;
    }
    if (g.enabled === false) {
      chip.textContent = '已禁用';
      chip.className = 'gh-chip gh-off';
      detail.textContent = `已配置 ${g.username}/${g.repo}，但自动同步已关闭`;
      return;
    }
    if (g.lastSyncAt) {
      const d = new Date(g.lastSyncAt);
      chip.textContent = g.lastSyncMsg?.startsWith('失败') ? '同步失败' : '正常';
      chip.className = g.lastSyncMsg?.startsWith('失败') ? 'gh-chip gh-err' : 'gh-chip gh-ok';
      detail.textContent = `上次同步 ${d.toLocaleString()} · ${g.lastSyncMsg || ''}`;
    } else {
      chip.textContent = '等待首次同步';
      chip.className = 'gh-chip gh-pending';
      detail.textContent = `已配置 ${g.username}/${g.repo}，点「立即同步一次」手动触发`;
    }
  }

  // 换主题立即预览，点「保存修改」后写回服务器
  $('setTheme').addEventListener('input', () => {
    readSettings();
    applyTheme(state.settings.theme);
    markDirty();
  });
  // 换卡片效果立即预览
  $('setCardStyle').addEventListener('input', () => {
    readSettings();
    applyCardStyle(state.settings.cardStyle);
    markDirty();
  });

  /* ------------------------------------------------------------ 分类管理 */

  function renderCategories() {
    const list = $('categoryList');
    list.textContent = '';
    $('catCount').textContent = String(state.categories.length);

    if (!state.categories.length) {
      list.appendChild(el('p', 'form-hint', '还没有分类，点右上角「添加分类」。'));
      return;
    }

    updateStats();
    state.categories.forEach((cat, index) => {
      const row = el('div', 'cat-row');
      const preview = el('div', 'cat-icon-preview');
      preview.style.color = cat.color;
      preview.innerHTML = iconSvg(cat.icon);

      const name = el('input', 'input-sm');
      name.value = cat.name;
      name.maxLength = 24;
      name.setAttribute('aria-label', '分类名称');
      name.addEventListener('input', () => {
        cat.name = name.value;
        markDirty();
      });

      const color = el('input', 'cat-color');
      color.type = 'color';
      color.value = cat.color;
      color.setAttribute('aria-label', '分类颜色');
      color.addEventListener('input', () => {
        cat.color = color.value;
        preview.style.color = color.value;
        markDirty();
      });

      const iconSelect = el('select', 'input-sm cat-icon-select');
      ICON_NAMES.forEach((key) => {
        const opt = el('option', null, `${ICON_LABEL[key] || key}（${key}）`);
        opt.value = key;
        iconSelect.appendChild(opt);
      });
      iconSelect.value = cat.icon;
      iconSelect.setAttribute('aria-label', '分类图标');
      iconSelect.addEventListener('change', () => {
        cat.icon = iconSelect.value;
        preview.innerHTML = iconSvg(cat.icon);
        markDirty();
      });

      const up = el('button', 'btn btn-ghost btn-sm cat-move', '↑');
      up.type = 'button';
      up.title = '上移';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const [moved] = state.categories.splice(index, 1);
        state.categories.splice(index - 1, 0, moved);
        renderCategories();
        markDirty();
      });

      const down = el('button', 'btn btn-ghost btn-sm cat-move', '↓');
      down.type = 'button';
      down.title = '下移';
      down.disabled = index === state.categories.length - 1;
      down.addEventListener('click', () => {
        if (index >= state.categories.length - 1) return;
        const [moved] = state.categories.splice(index, 1);
        state.categories.splice(index + 1, 0, moved);
        renderCategories();
        markDirty();
      });

      const del = el('button', 'btn btn-danger btn-sm', '删除');
      del.type = 'button';
      del.addEventListener('click', () => {
        const fallback = state.categories[0] && state.categories[0].id;
        const affected = state.items.filter((i) => i.category === cat.id).length;
        if (affected && state.categories.length === 1) {
          toast('至少保留一个分类', true);
          return;
        }
        if (!confirm(`删除分类「${cat.name}」？${affected ? `其中 ${affected} 个站点会移到「${state.categories[0].name}」。` : ''}`)) return;
        state.items.forEach((item) => {
          if (item.category === cat.id) item.category = fallback || 'misc';
        });
        state.categories.splice(index, 1);
        renderCategories();
        renderSites();
        markDirty();
      });

      row.appendChild(preview);
      row.appendChild(name);
      row.appendChild(color);
      row.appendChild(iconSelect);
      row.appendChild(up);
      row.appendChild(down);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  $('addCategory').addEventListener('click', () => {
    state.categories.push({
      id: newId('cat'),
      name: '新分类',
      color: '#4BE1C0',
      icon: 'grid'
    });
    renderCategories();
    markDirty();
  });

  /* ------------------------------------------------------------ 网址管理 */

  function normalizeHost(url) {
    return hostOf(url).toLowerCase();
  }

  function renderSites() {
    const body = $('siteTableBody');
    body.textContent = '';
    const query = state.siteQuery.trim().toLowerCase();
    const rows = state.items.filter((item) => {
      if (!query) return true;
      return [item.title, item.desc, item.urlLan, item.urlWan, item.category]
        .join(' ').toLowerCase().includes(query);
    });

    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', null, state.items.length ? '没有匹配的站点' : '还没有站点，点「添加网址」。');
      td.colSpan = 5;
      td.style.textAlign = 'center';
      td.style.padding = '26px';
      tr.appendChild(td);
      body.appendChild(tr);
    }

    rows.forEach((item) => {
      const tr = el('tr');

      const titleCell = el('td', 'title-cell');
      const line = el('div');
      line.style.display = 'flex';
      line.style.alignItems = 'center';
      line.style.gap = '6px';
      line.appendChild(el('span', null, item.title));
      if (item.pinned) {
        const pill = el('span', 'pill', '常用');
        pill.style.color = '#9ff0dc';
        line.appendChild(pill);
      }
      titleCell.appendChild(line);
      if (item.desc) {
        const desc = el('div', 'form-hint', item.desc);
        desc.style.marginTop = '2px';
        titleCell.appendChild(desc);
      }

      const cat = state.categories.find((c) => c.id === item.category);
      const catCell = el('td');
      catCell.textContent = cat ? cat.name : '未分类';
      if (cat) catCell.style.color = cat.color;

      const lanCell = el('td', 'url-cell', item.urlLan ? hostOf(item.urlLan) : '—');
      const wanCell = el('td', 'url-cell', item.urlWan ? hostOf(item.urlWan) : '—');

      const actionCell = el('td');
      const actions = el('div', 'row-actions');
      const edit = el('button', null, '编辑');
      edit.type = 'button';
      edit.addEventListener('click', () => openItemModal(item.id));
      const del = el('button', 'danger', '删除');
      del.type = 'button';
      del.addEventListener('click', () => {
        if (!confirm(`删除站点「${item.title}」？`)) return;
        state.items = state.items.filter((i) => i.id !== item.id);
        renderSites();
        markDirty();
      });
      actions.appendChild(edit);
      actions.appendChild(del);
      actionCell.appendChild(actions);

      tr.appendChild(titleCell);
      tr.appendChild(catCell);
      tr.appendChild(lanCell);
      tr.appendChild(wanCell);
      tr.appendChild(actionCell);
      body.appendChild(tr);
    });

    const lan = state.items.filter((i) => i.urlLan).length;
    const wan = state.items.filter((i) => i.urlWan).length;
    $('siteSummary').textContent = `共 ${state.items.length} 个站点：${lan} 个配了内网地址，${wan} 个配了公网地址。`;
    updateStats();
  }

  $('siteSearch').addEventListener('input', () => {
    state.siteQuery = $('siteSearch').value;
    renderSites();
  });

  $('addSite').addEventListener('click', () => openItemModal(null));

  function fillCategoryOptions(select, value) {
    select.textContent = '';
    const auto = el('option', null, '自动判断');
    auto.value = '';
    select.appendChild(auto);
    state.categories.forEach((cat) => {
      const opt = el('option', null, cat.name);
      opt.value = cat.id;
      select.appendChild(opt);
    });
    select.value = value || '';
  }

  function openItemModal(id) {
    const isEdit = Boolean(id);
    const item = isEdit ? state.items.find((i) => i.id === id) : null;
    state.editingItemId = id;
    $('itemModalTitle').textContent = isEdit ? '编辑站点' : '添加网址';
    fillCategoryOptions($('itemCategory'), item ? item.category : '');
    $('itemTitle').value = item ? item.title : '';
    $('itemDesc').value = item ? item.desc : '';
    $('itemUrlLan').value = item ? item.urlLan : '';
    $('itemUrlWan').value = item ? item.urlWan : '';
    $('itemIcon').value = item ? item.icon : '';
    updateIconPreview($('itemIcon').value);
    $('itemTags').value = item && item.tags ? item.tags.join(', ') : '';
    $('itemPinned').checked = item ? Boolean(item.pinned) : false;
    $('itemFormError').textContent = '';
    openModal('itemModal');
    setTimeout(() => $('itemTitle').focus(), 60);
  }

  function updateIconPreview(url) {
    const box = $('itemIconPreview');
    if (!box) return;
    const v = String(url || '').trim();
    if (v) {
      box.style.backgroundImage = `url("${v.replace(/"/g, '%22')}")`;
      box.classList.add('has-img');
    } else {
      box.style.backgroundImage = '';
      box.classList.remove('has-img');
    }
  }

  function guessCategoryFor(url, title) {
    const taxonomy = window.AuroraTaxonomy;
    if (!taxonomy) return '';
    const guess = taxonomy.guess(url, title);
    if (!guess) return '';
    return state.categories.some((c) => c.id === guess) ? guess : '';
  }

  (function bindIconUpload() {
    const pick = $('itemIconPick');
    const file = $('itemIconFile');
    const input = $('itemIcon');
    const hint = $('itemIconHint');
    const fetchBtn = $('itemIconFetch');
    if (!pick || !file) return;

    pick.addEventListener('click', () => file.click());
    input.addEventListener('input', () => updateIconPreview(input.value));

    if (fetchBtn) {
      fetchBtn.addEventListener('click', async () => {
        // 优先用公网地址，其次内网地址，最后用图标框里已填的地址
        const candidates = [$('itemUrlWan').value.trim(), $('itemUrlLan').value.trim(), input.value.trim()];
        const source = candidates.find((v) => /^https?:\/\//i.test(v) || /^[\w.-]+\.[a-z]{2,}/i.test(v));
        if (!source) {
          hint.classList.add('is-error');
          hint.textContent = '请先填写站点地址，再自动获取图标。';
          return;
        }
        const oldText = fetchBtn.textContent;
        fetchBtn.disabled = true;
        fetchBtn.textContent = '获取中…';
        hint.classList.remove('is-error');
        hint.textContent = '正在从网上获取图标…';
        try {
          const res = await api('/api/admin/icon/fetch', { method: 'POST', body: JSON.stringify({ url: source }) });
          input.value = res.url;
          updateIconPreview(res.url);
          hint.textContent = '已获取图标（保存修改后生效）';
        } catch (err) {
          hint.classList.add('is-error');
          hint.textContent = err.message || '获取失败，可手动上传';
        } finally {
          fetchBtn.disabled = false;
          fetchBtn.textContent = oldText;
        }
      });
    }

    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      if (f.size > 512 * 1024) {
        hint.textContent = '图片超过 512 KB，请压缩后再上传。';
        hint.classList.add('is-error');
        return;
      }
      hint.classList.remove('is-error');
      hint.textContent = '正在上传…';
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('读取文件失败'));
          reader.readAsDataURL(f);
        });
        const res = await api('/api/admin/icon', { method: 'POST', body: JSON.stringify({ data: dataUrl }) });
        input.value = res.url;
        updateIconPreview(res.url);
        hint.textContent = `已上传：${f.name}（保存修改后生效）`;
      } catch (err) {
        hint.classList.add('is-error');
        hint.textContent = err.message || '上传失败';
      }
    });
  })();

  ['itemUrlLan', 'itemUrlWan'].forEach((id) => {
    $(id).addEventListener('blur', () => {
      const url = ensureScheme($(id).value);
      if (!url) return;
      $(id).value = url;
      if (!$('itemTitle').value.trim()) {
        try {
          const host = new URL(url).hostname.replace(/^www\./, '');
          const parts = host.split('.');
          const guessName = parts.length > 1 ? parts[0] : host;
          $('itemTitle').value = guessName.charAt(0).toUpperCase() + guessName.slice(1);
        } catch (e) { /* 忽略 */ }
      }
      const cat = guessCategoryFor(url, $('itemTitle').value);
      if (cat && $('itemCategory').value === '') $('itemCategory').value = cat;
    });
  });

  $('itemForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = $('itemTitle').value.trim();
    const lan = ensureScheme($('itemUrlLan').value);
    const wan = ensureScheme($('itemUrlWan').value);
    if (!title) {
      $('itemFormError').textContent = '请填写站点名称';
      return;
    }
    if (!lan && !wan) {
      $('itemFormError').textContent = '至少填写一个内网或公网地址';
      return;
    }
    const urlPattern = /^https?:\/\/[^\s]+$/i;
    if ((lan && !urlPattern.test(lan)) || (wan && !urlPattern.test(wan))) {
      $('itemFormError').textContent = '地址需要以 http:// 或 https:// 开头';
      return;
    }

    let category = $('itemCategory').value;
    if (!category || !state.categories.some((c) => c.id === category)) {
      category = guessCategoryFor(lan || wan, title) || (state.categories[0] && state.categories[0].id) || 'misc';
    }

    const payload = {
      id: state.editingItemId || newId('site'),
      title,
      desc: $('itemDesc').value.trim(),
      urlLan: lan,
      urlWan: wan,
      category,
      icon: $('itemIcon').value.trim(),
      tags: $('itemTags').value.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 6),
      pinned: $('itemPinned').checked
    };

    if (state.editingItemId) {
      const index = state.items.findIndex((i) => i.id === state.editingItemId);
      if (index >= 0) state.items[index] = payload;
    } else {
      state.items.push(payload);
    }
    closeModal('itemModal');
    renderSites();
    markDirty();
    toast(state.editingItemId ? '站点已更新到草稿' : '站点已加入草稿，记得保存');
  });

  $('autoCategorize').addEventListener('click', () => {
    let changed = 0;
    state.items.forEach((item) => {
      const hasMeaningful = state.categories.some((c) => c.id === item.category && c.id !== 'misc');
      if (hasMeaningful) return;
      const guess = guessCategoryFor(item.urlLan || item.urlWan, `${item.title} ${item.desc || ''}`);
      if (guess) {
        item.category = guess;
        changed += 1;
      }
    });
    renderSites();
    markDirty();
    toast(changed ? `已为 ${changed} 个站点补上分类` : '没有需要归类的站点');
  });

  /* ---------------------------------------------------------- 密码保险箱 */

  function renderVaultLocked() {
    $('vaultLock').hidden = false;
    $('vaultOpen').hidden = true;
    $('vaultError').textContent = '';
    $('vaultPassword').value = '';
    $('vaultSearch').value = '';
    state.vaultQuery = '';
  }

  function renderVault() {
    $('vaultLock').hidden = true;
    $('vaultOpen').hidden = false;
    $('vaultCount').textContent = String(state.vaultEntries.length);
    const list = $('vaultList');
    list.textContent = '';
    if (!state.vaultEntries.length) {
      list.appendChild(el('p', 'form-hint', '保险箱还是空的，点「添加条目」。'));
      return;
    }
    const query = state.vaultQuery.trim().toLowerCase();
    const entries = state.vaultEntries.filter((entry) => !query
      || [entry.title, entry.username, entry.note, entry.url].join(' ').toLowerCase().includes(query));
    if (!entries.length) {
      list.appendChild(el('p', 'form-hint', '没有匹配的条目。'));
      return;
    }
    entries.forEach((entry) => {
      const item = el('div', 'vault-item');
      const left = el('div');
      left.appendChild(el('div', 'vault-title', entry.title));
      const meta = [entry.username, entry.note].filter(Boolean).join(' · ');
      if (meta) left.appendChild(el('div', 'vault-meta', meta));

      const secret = el('div', 'vault-secret');
      const pw = el('span', 'pw', '••••••••');
      let shown = false;
      secret.appendChild(pw);
      const toggle = el('button', 'mini-link', '显示');
      toggle.type = 'button';
      toggle.addEventListener('click', () => {
        shown = !shown;
        pw.textContent = shown ? (entry.password || '（空）') : '••••••••';
        pw.classList.toggle('revealed', shown);
        toggle.textContent = shown ? '隐藏' : '显示';
      });
      const copy = el('button', 'mini-link', '复制');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(entry.password || '');
          toast('密码已复制到剪贴板');
        } catch (e) {
          toast('复制失败，请手动选择密码', true);
        }
      });
      secret.appendChild(toggle);
      secret.appendChild(copy);
      if (entry.url) {
        const open = el('a', 'mini-link', '打开');
        open.href = entry.url;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.style.marginLeft = '2px';
        secret.appendChild(open);
      }
      left.appendChild(secret);

      const actions = el('div', 'row-actions');
      actions.style.alignItems = 'flex-start';
      const edit = el('button', null, '编辑');
      edit.type = 'button';
      edit.addEventListener('click', () => openVaultModal(entry));
      const del = el('button', 'danger', '删除');
      del.type = 'button';
      del.addEventListener('click', () => {
        if (!confirm(`删除保险箱条目「${entry.title}」？`)) return;
        const index = state.vaultEntries.indexOf(entry);
        if (index >= 0) state.vaultEntries.splice(index, 1);
        renderVault();
      });
      actions.appendChild(edit);
      actions.appendChild(del);

      item.appendChild(left);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  $('vaultForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('vaultPassword').value;
    $('vaultError').textContent = '';
    try {
      const result = await api('/api/vault/unlock', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      state.vaultToken = result.token;
      state.vaultEntries = result.entries;
      renderVault();
      toast('保险箱已解锁，30 分钟后自动上锁');
    } catch (err) {
      $('vaultError').textContent = err.message || '解锁失败';
    }
  });

  $('vaultRelock').addEventListener('click', () => {
    state.vaultToken = '';
    state.vaultEntries = [];
    renderVaultLocked();
  });

  function openVaultModal(entry) {
    const index = entry ? state.vaultEntries.indexOf(entry) : -1;
    state.editingVaultId = index >= 0 ? index : null;
    $('vaultModalTitle').textContent = entry ? '编辑条目' : '新增条目';
    $('vaultTitle').value = entry ? entry.title : '';
    $('vaultUser').value = entry ? entry.username : '';
    $('vaultPass').value = entry ? entry.password : '';
    $('vaultUrl').value = entry ? entry.url : '';
    $('vaultNote').value = entry ? entry.note : '';
    openModal('vaultModal');
    setTimeout(() => $('vaultTitle').focus(), 60);
  }

  $('addVaultEntry').addEventListener('click', () => openVaultModal(null));

  $('vaultSearch').addEventListener('input', () => {
    state.vaultQuery = $('vaultSearch').value;
    renderVault();
  });

  $('vaultEntryForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = {
      id: state.editingVaultId != null
        ? state.vaultEntries[state.editingVaultId].id
        : newId('vault'),
      title: $('vaultTitle').value.trim(),
      username: $('vaultUser').value.trim(),
      password: $('vaultPass').value,
      url: $('vaultUrl').value.trim(),
      note: $('vaultNote').value.trim()
    };
    if (!payload.title) return;
    if (state.editingVaultId != null) {
      state.vaultEntries[state.editingVaultId] = payload;
    } else {
      state.vaultEntries.push(payload);
    }
    closeModal('vaultModal');
    renderVault();
    toast('条目已加入草稿，点「保存保险箱」写回');
  });

  $('vaultSave').addEventListener('click', async () => {
    if (!state.vaultToken) {
      toast('请先解锁保险箱', true);
      return;
    }
    try {
      const result = await api('/api/vault', {
        method: 'PUT',
        body: JSON.stringify({ token: state.vaultToken, entries: state.vaultEntries })
      });
      state.vaultEntries = result.entries;
      state.vaultCount = result.entries.length;
      renderVault();
      updateStats();
      toast('保险箱已保存');
    } catch (err) {
      if (err.status === 403) {
        renderVaultLocked();
        $('vaultError').textContent = '会话已过期，请重新输入主密码';
      }
      toast(err.message || '保存失败', true);
    }
  });

  /* ------------------------------------------------------------ 导入导出 */

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('exportJson').addEventListener('click', () => {
    readSettings();
    download('nebula-nav-backup.json', JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      categories: state.categories,
      items: state.items
    }, null, 2));
    toast('已导出备份 JSON');
  });

  $('importJson').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.categories) || !Array.isArray(data.items)) {
        throw new Error('文件里没有 categories / items');
      }
      state.categories = data.categories.map((cat, i) => ({
        id: cat.id || newId('cat'),
        name: String(cat.name || `分类 ${i + 1}`).slice(0, 24),
        color: /^#[0-9a-f]{6}$/i.test(cat.color || '') ? cat.color : '#4BE1C0',
        icon: ICON_SVG[cat.icon] ? cat.icon : 'grid'
      }));
      state.items = data.items.map((item) => ({
        id: item.id || newId('site'),
        title: String(item.title || '未命名').slice(0, 40),
        desc: String(item.desc || '').slice(0, 80),
        urlLan: String(item.urlLan || '').slice(0, 300),
        urlWan: String(item.urlWan || '').slice(0, 300),
        category: state.categories.some((c) => c.id === item.category) ? item.category : state.categories[0].id,
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 6) : [],
        icon: String(item.icon || ''),
        pinned: Boolean(item.pinned)
      }));
      if (data.settings) {
        const themes = ['nebula', 'ocean', 'forest', 'dusk', 'sunset', 'graphite', 'dawn', 'paper'];
        state.settings = {
          siteTitle: String(data.settings.siteTitle || 'Nebula Nav').slice(0, 24),
          siteSubtitle: String(data.settings.siteSubtitle || '').slice(0, 60),
          footerNote: String(data.settings.footerNote || '').slice(0, 120),
          ghRepo: String(data.settings.ghRepo || '').slice(0, 200),
          icp: String(data.settings.icp || '').slice(0, 80),
          defaultMode: ['auto', 'lan', 'wan'].includes(data.settings.defaultMode) ? data.settings.defaultMode : 'lan',
          theme: themes.includes(data.settings.theme) ? data.settings.theme : 'nebula',
          cardStyle: ['default','emboss','inset','glass','neon','gradient','float3d','minimal','shadow'].includes(data.settings.cardStyle) ? data.settings.cardStyle : 'default',
          showModeSwitch: data.settings.showModeSwitch !== false,
          showRecent: data.settings.showRecent !== false,
          showPinned: data.settings.showPinned !== false,
          showClock: data.settings.showClock !== false,
          showQuote: data.settings.showQuote !== false,
          showMonitor: data.settings.showMonitor !== false,
          greeting: String(data.settings.greeting || '').slice(0, 40),
          diskPaths: String(data.settings.diskPaths || '/').slice(0, 200)
        };
      }
      bindSettings();
      renderCategories();
      renderSites();
      markDirty();
      $('ioState').textContent = `已载入 ${state.items.length} 个站点，${state.categories.length} 个分类，保存后生效。`;
      toast('JSON 已载入草稿，记得保存');
    } catch (err) {
      $('ioState').textContent = `导入失败：${err.message}`;
      toast('导入失败：文件格式不正确', true);
    } finally {
      event.target.value = '';
    }
  });

  $('importBookmarks').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const links = Array.from(doc.querySelectorAll('a[href]'));
      let added = 0;
      let skipped = 0;
      const known = new Set();
      state.items.forEach((item) => {
        [item.urlLan, item.urlWan].forEach((u) => { if (u) known.add(normalizeHost(u)); });
      });

      for (const link of links) {
        if (added >= 400) break;
        const href = link.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) continue;
        const host = normalizeHost(href);
        if (known.has(host)) { skipped += 1; continue; }
        known.add(host);
        const title = (link.textContent || '').trim().slice(0, 40) || host;
        const folder = folderOf(link);
        const matched = state.categories.find((c) => folder && (folder.includes(c.name) || c.name.includes(folder)));
        const category = (matched && matched.id)
          || guessCategoryFor(href, `${title} ${folder}`)
          || (state.categories[0] && state.categories[0].id)
          || 'misc';
        state.items.push({
          id: newId('site'),
          title,
          desc: folder && !matched ? folder.slice(0, 80) : '',
          urlLan: href,
          urlWan: href,
          category,
          tags: [],
          icon: '',
          pinned: false
        });
        added += 1;
      }
      renderSites();
      markDirty();
      $('ioState').textContent = `从书签导入 ${added} 个站点，跳过 ${skipped} 个重复地址。保存后生效。`;
      toast(`已导入 ${added} 个书签站点`);
    } catch (err) {
      $('ioState').textContent = `书签解析失败：${err.message}`;
      toast('书签解析失败', true);
    } finally {
      event.target.value = '';
    }
  });

  function folderOf(node) {
    let dl = node.closest('dl');
    while (dl) {
      const prev = dl.previousElementSibling;
      if (prev && prev.tagName === 'H3') return prev.textContent.trim();
      const parentDl = dl.parentElement && dl.parentElement.closest('dl');
      if (parentDl) {
        dl = parentDl;
        continue;
      }
      const parent = dl.parentElement;
      if (parent && parent.tagName === 'DT') {
        const h3 = parent.querySelector('h3');
        if (h3) return h3.textContent.trim();
      }
      break;
    }
    const anyH3 = node.closest('dt') && node.closest('dt').querySelector('h3');
    return anyH3 ? anyH3.textContent.trim() : '';
  }

  /* ------------------------------------------------------------ 安全账号 */

  $('frontPwForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = $('frontCurrent').value;
    const newPassword = $('frontNew').value;
    if (newPassword.length < 6) {
      toast('新密码至少 6 位', true);
      return;
    }
    try {
      await api('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({ role: 'front', currentPassword, newPassword })
      });
      $('frontCurrent').value = '';
      $('frontNew').value = '';
      toast('前台访问密码已更新');
    } catch (err) {
      toast(err.message || '更新失败', true);
    }
  });

  $('adminPwForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = $('adminUsername').value.trim();
    const currentPassword = $('adminCurrent').value;
    const newPassword = $('adminNew').value;
    if (newPassword.length < 6) {
      toast('新密码至少 6 位', true);
      return;
    }
    try {
      await api('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({ role: 'admin', username, currentPassword, newPassword })
      });
      $('adminCurrent').value = '';
      $('adminNew').value = '';
      state.settings.adminUsername = username || state.settings.adminUsername;
      toast('后台账号已更新，下次登录使用新账号密码');
    } catch (err) {
      toast(err.message || '更新失败', true);
    }
  });

  /* -------------------------------------------------------------- 保存 */

  $('saveBtn').addEventListener('click', async () => {
    readSettings();
    const btn = $('saveBtn');
    btn.disabled = true;
    try {
      const result = await api('/api/admin/data', {
        method: 'PUT',
        body: JSON.stringify({
          settings: state.settings,
          categories: state.categories,
          items: state.items
        })
      });
      state.settings = result.settings;
      state.categories = result.categories;
      state.items = result.items;
      state.updatedAt = result.updatedAt || new Date().toISOString();
      state.saved = snapshot();
      state.dirty = false;
      bindSettings();
      renderCategories();
      renderSites();
      updateStats();
      updateSaveState();
      toast('已保存到服务器');
    } catch (err) {
      toast(err.message || '保存失败', true);
      updateSaveState();
    }
  });

  /* ------------------------------------------------------------ 交互框架 */

  $('adminNav').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-panel]');
    if (!btn) return;
    state.panel = btn.dataset.panel;
    $('adminNav').querySelectorAll('button[data-panel]').forEach((b) => {
      b.setAttribute('aria-current', String(b === btn));
    });
    document.querySelectorAll('.panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panelBody === state.panel);
    });
  });

  function openModal(id) {
    $(id).classList.add('open');
  }

  function closeModal(id) {
    $(id).classList.remove('open');
  }

  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close]');
    if (closer) {
      closeModal(closer.dataset.close);
      return;
    }
    if (event.target.classList.contains('modal-mask')) {
      event.target.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-mask.open').forEach((mask) => mask.classList.remove('open'));
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  init();
})();
