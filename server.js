#!/usr/bin/env node
'use strict';

/**
 * Nebula Nav · 星云导航
 * 零依赖 Node 服务：静态资源 + 密码会话 + 配置读写 + 图标代理
 * 数据落盘在 data/data.json（Docker 下默认 /data/data.json）
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const SEED_FILE = path.join(ROOT, 'seed.json');
const FAVICON_DIR = path.join(DATA_DIR, 'favicons');
const ICON_DIR = path.join(DATA_DIR, 'icons');
const SECRET_FILE = path.join(DATA_DIR, '.secret');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const COOKIE_NAME = 'aurora_session';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

const SESSION_TTL = {
  front: 7 * 24 * 3600,
  admin: 8 * 3600,
  vault: 1800
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const ICON_EXT = { ico: 'ico', png: 'png', svg: 'svg', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp' };
const CATEGORY_ICONS = ['film', 'drive', 'code', 'spark', 'book', 'flow', 'grid', 'star', 'link', 'shield'];

/* ---------------------------------------------------------------- 基础设施 */

let SESSION_SECRET = '';
let db = null;
let saving = Promise.resolve();

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function hexColor(value, fallback) {
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback;
}

function clip(value, max) {
  return String(value == null ? '' : value).replace(/\u0000/g, '').slice(0, max);
}

function slugify(value, fallback) {
  const s = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || fallback;
}

function safeUrl(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v.slice(0, 300);
  return '';
}

/* 自定义图标：允许 http(s) 地址，也允许本站上传后的 /icons/xxx 路径 */
function safeIcon(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^\/icons\/[a-f0-9]{16}\.(png|jpg|gif|webp|ico|svg)$/i.test(v)) return v;
  return safeUrl(v);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ 会话签名 */

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token, role) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx < 1) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (role && payload.role !== role) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function getSession(req) {
  const payload = verifyToken(parseCookies(req)[COOKIE_NAME]);
  if (!payload) return null;
  return payload;
}

function setSessionCookie(res, payload) {
  const ttl = SESSION_TTL[payload.role] || SESSION_TTL.front;
  const token = signToken({ ...payload, exp: Math.floor(Date.now() / 1000) + ttl });
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${COOKIE_SECURE ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}`);
}

/* ----------------------------------------------------------------- 限流保护 */

const failures = new Map();

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function checkRate(req) {
  const entry = failures.get(clientIp(req));
  if (!entry) return true;
  if (entry.blockedUntil && entry.blockedUntil > Date.now()) return false;
  return true;
}

function recordFailure(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = failures.get(ip) || { count: 0, first: now, blockedUntil: 0 };
  if (now - entry.first > 10 * 60 * 1000) {
    entry.count = 0;
    entry.first = now;
  }
  entry.count += 1;
  if (entry.count >= 8) {
    entry.blockedUntil = now + 10 * 60 * 1000;
    entry.count = 0;
    entry.first = now;
  }
  failures.set(ip, entry);
  if (failures.size > 5000) failures.clear();
}

function resetFailure(req) {
  failures.delete(clientIp(req));
}

/* ------------------------------------------------------------------ 数据读写 */

function defaultData() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  seed.settings.frontPasswordHash = hashPassword(process.env.FRONT_PASSWORD || '123456');
  seed.settings.adminUsername = process.env.ADMIN_USERNAME || 'admin';
  seed.settings.adminPasswordHash = hashPassword(process.env.ADMIN_PASSWORD || 'admin123');
  seed.updatedAt = new Date().toISOString();
  return seed;
}

function loadDb() {
  ensureDir(DATA_DIR);
  ensureDir(FAVICON_DIR);
  ensureDir(ICON_DIR);
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    db.settings = db.settings || {};
    db.categories = Array.isArray(db.categories) ? db.categories : [];
    db.items = Array.isArray(db.items) ? db.items : [];
    db.vault = Array.isArray(db.vault) ? db.vault : [];
  } else {
    db = defaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), { mode: 0o600 });
    log('已初始化数据文件:', DATA_FILE);
  }
  if (!db.settings.frontPasswordHash) db.settings.frontPasswordHash = hashPassword(process.env.FRONT_PASSWORD || '123456');
  if (!db.settings.adminPasswordHash) {
    db.settings.adminUsername = db.settings.adminUsername || 'admin';
    db.settings.adminPasswordHash = hashPassword(process.env.ADMIN_PASSWORD || 'admin123');
  }
  if (!db.settings.adminUsername) db.settings.adminUsername = 'admin';
}

function saveDb() {
  const snapshot = JSON.stringify(db, null, 2);
  const tmp = `${DATA_FILE}.tmp`;
  saving = saving.then(async () => {
    await fsp.writeFile(tmp, snapshot, { mode: 0o600 });
    await fsp.rename(tmp, DATA_FILE);
  }).catch((err) => log('写入数据失败:', err.message));
  return saving;
}

/* ------------------------------------------------------------------ 数据清洗 */

function normalizeCategories(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).slice(0, 60).map((c, i) => {
    let id = slugify(c && c.id, `cat-${i + 1}`);
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    return {
      id,
      name: clip(c && c.name, 24) || `分类 ${i + 1}`,
      color: hexColor(c && c.color, '#8FA0B8'),
      icon: CATEGORY_ICONS.includes(c && c.icon) ? c.icon : 'grid'
    };
  });
}

function normalizeItems(list, categories) {
  const seen = new Set();
  const catIds = new Set(categories.map((c) => c.id));
  return (Array.isArray(list) ? list : []).slice(0, 500).map((item, i) => {
    let id = slugify(item && item.id, `site-${i + 1}`);
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    return {
      id,
      title: clip(item && item.title, 40) || `站点 ${i + 1}`,
      desc: clip(item && item.desc, 80),
      urlLan: safeUrl(item && item.urlLan),
      urlWan: safeUrl(item && item.urlWan),
      category: catIds.has(item && item.category) ? item.category : (categories[0] ? categories[0].id : 'misc'),
      tags: (Array.isArray(item && item.tags) ? item.tags : []).slice(0, 6).map((t) => clip(t, 16)).filter(Boolean),
      icon: safeIcon(item && item.icon),
      pinned: Boolean(item && item.pinned)
    };
  });
}

/* 按文件头判断真实图片类型，防止把任意文件当图标存下来 */
function detectImageExt(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 6 && buf.slice(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.length > 6 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'ico';
  if (buf.length > 8) {
    const head = buf.slice(0, 64).toString('utf8').trim().toLowerCase();
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  }
  return '';
}

function normalizeVault(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).slice(0, 300).map((entry, i) => {
    let id = slugify(entry && entry.id, `vault-${i + 1}`);
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    return {
      id,
      title: clip(entry && entry.title, 40) || `条目 ${i + 1}`,
      username: clip(entry && entry.username, 80),
      password: clip(entry && entry.password, 200),
      url: safeUrl(entry && entry.url),
      note: clip(entry && entry.note, 200)
    };
  });
}

function publicSettings() {
  return {
    siteTitle: clip(db.settings.siteTitle, 24) || 'Nebula Nav',
    siteSubtitle: clip(db.settings.siteSubtitle, 60),
    footerNote: clip(db.settings.footerNote, 120),
    defaultMode: ['auto', 'lan', 'wan'].includes(db.settings.defaultMode) ? db.settings.defaultMode : 'lan',
    showModeSwitch: db.settings.showModeSwitch !== false
  };
}

function adminSettings() {
  return { ...publicSettings(), adminUsername: db.settings.adminUsername || 'admin' };
}

/* -------------------------------------------------------------------- HTTP 层 */

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readJson(req, limit = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('invalid json'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function requireRole(req, res, roles) {
  const session = getSession(req);
  if (!session || !roles.includes(session.role)) {
    sendJson(res, 401, { error: 'unauthorized', needAuth: true });
    return null;
  }
  return session;
}

/* ---------------------------------------------------------------- 图标代理 */

function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function faviconPath(hostSha) {
  for (const ext of Object.values(ICON_EXT)) {
    const file = path.join(FAVICON_DIR, `${hostSha}.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function fetchRemote(url, redirects = 0) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NebulaNav/1.0; +https://github.com)',
        Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8'
      }
    }, (r) => {
      const status = r.statusCode || 0;
      const type = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (status >= 300 && status < 400 && r.headers.location && redirects < 4) {
        r.resume();
        resolve(fetchRemote(new URL(r.headers.location, url).toString(), redirects + 1));
        return;
      }
      if (status !== 200 || !type.startsWith('image/')) {
        r.resume();
        resolve(null);
        return;
      }
      const chunks = [];
      let size = 0;
      r.on('data', (chunk) => {
        size += chunk.length;
        if (size > 512 * 1024) {
          req.destroy();
          resolve(null);
          return;
        }
        chunks.push(chunk);
      });
      r.on('end', () => resolve({ buffer: Buffer.concat(chunks), type }));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function isPrivateHost(host) {
  const h = host.split(':')[0].toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.lan')) return true;
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^127\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

async function handleFavicon(req, res, url) {
  const host = clip(url.searchParams.get('host'), 120).replace(/[^\w.:\-[\]]/g, '');
  if (!host) return sendJson(res, 400, { error: 'bad host' });
  const key = sha1(host.toLowerCase());
  const cached = faviconPath(key);
  if (cached) {
    const ext = path.extname(cached).slice(1);
    const body = await fsp.readFile(cached);
    res.writeHead(200, {
      'Content-Type': ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'ico' ? 'x-icon' : ext}`,
      'Cache-Control': 'public, max-age=604800'
    });
    return res.end(body);
  }
  const protocol = isPrivateHost(host) ? 'http' : 'https';
  let result = await fetchRemote(`${protocol}://${host}/favicon.ico`);
  if (!result && protocol === 'https') {
    result = await fetchRemote(`https://${host}/favicon.png`);
  }
  if (!result) {
    res.writeHead(404, { 'Cache-Control': 'public, max-age=3600' });
    return res.end('not found');
  }
  const ext = ICON_EXT[(result.type.split('/')[1] || '').toLowerCase()] || 'ico';
  try {
    await fsp.writeFile(path.join(FAVICON_DIR, `${key}.${ext}`), result.buffer);
  } catch (err) {
    log('图标缓存失败:', err.message);
  }
  res.writeHead(200, {
    'Content-Type': result.type.split('/')[1] === 'svg' ? 'image/svg+xml' : result.type,
    'Cache-Control': 'public, max-age=604800'
  });
  res.end(result.buffer);
}

/* --------------------------------------------------------------- 静态文件 */

const ICON_NAME_RE = /^[a-f0-9]{16}\.(png|jpg|gif|webp|ico|svg)$/;

async function serveIcon(req, res, pathname) {
  const name = pathname.slice('/icons/'.length);
  if (!ICON_NAME_RE.test(name)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }
  const file = path.join(ICON_DIR, name);
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }
  if (!stat.isFile()) {
    res.writeHead(404);
    return res.end('404 Not Found');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=604800',
    'X-Content-Type-Options': 'nosniff',
    // 上传的 SVG 里可能带脚本，直接打开时禁掉一切执行能力
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
  });
  fs.createReadStream(file).pipe(res);
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(PUBLIC_DIR, `.${rel}`);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }
  if (!stat.isFile()) {
    res.writeHead(404);
    return res.end('404 Not Found');
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  // 静态资源：图片可长缓存，HTML/CSS/JS 每次回源校验，改完刷新即生效
  const longCache = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff2'].includes(ext);
  const cache = longCache ? 'public, max-age=604800' : 'no-cache';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(file).pipe(res);
}

/* --------------------------------------------------------------- 路由处理 */

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || 'GET';

  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  }

  if (pathname === '/api/auth/status' && method === 'GET') {
    const session = getSession(req);
    return sendJson(res, 200, {
      role: session ? session.role : null,
      siteTitle: db.settings.siteTitle || 'Nebula Nav',
      showModeSwitch: db.settings.showModeSwitch !== false,
      defaultMode: publicSettings().defaultMode
    });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    if (!checkRate(req)) return sendJson(res, 429, { error: '尝试过于频繁，请 10 分钟后再试' });
    const body = await readJson(req);
    const ok = verifyPassword(body.password, db.settings.frontPasswordHash);
    if (!ok) {
      recordFailure(req);
      return sendJson(res, 401, { error: '访问密码不正确' });
    }
    resetFailure(req);
    setSessionCookie(res, { role: 'front' });
    return sendJson(res, 200, { ok: true, role: 'front' });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/config' && method === 'GET') {
    const session = requireRole(req, res, ['front', 'admin']);
    if (!session) return;
    return sendJson(res, 200, {
      settings: publicSettings(),
      categories: db.categories,
      items: db.items,
      updatedAt: db.updatedAt || null
    });
  }

  if (pathname === '/api/favicon' && method === 'GET') {
    const session = requireRole(req, res, ['front', 'admin']);
    if (!session) return;
    return handleFavicon(req, res, url);
  }

  if (pathname === '/api/vault/unlock' && method === 'POST') {
    const session = requireRole(req, res, ['front', 'admin']);
    if (!session) return;
    if (!checkRate(req)) return sendJson(res, 429, { error: '尝试过于频繁，请稍后再试' });
    const body = await readJson(req);
    if (!verifyPassword(body.password, db.settings.frontPasswordHash)) {
      recordFailure(req);
      return sendJson(res, 401, { error: '主密码不正确' });
    }
    resetFailure(req);
    const token = signToken({
      role: 'vault',
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL.vault
    });
    return sendJson(res, 200, { token, entries: db.vault });
  }

  if (pathname === '/api/vault' && method === 'PUT') {
    const session = requireRole(req, res, ['front', 'admin']);
    if (!session) return;
    const body = await readJson(req);
    const payload = verifyToken(body.token, 'vault');
    if (!payload) return sendJson(res, 403, { error: '保险箱已锁定，请重新验证主密码' });
    db.vault = normalizeVault(body.entries);
    db.updatedAt = new Date().toISOString();
    await saveDb();
    return sendJson(res, 200, { ok: true, entries: db.vault });
  }

  if (pathname === '/api/admin/login' && method === 'POST') {
    if (!checkRate(req)) return sendJson(res, 429, { error: '尝试过于频繁，请 10 分钟后再试' });
    const body = await readJson(req);
    const usernameOk = String(body.username || '').trim() === (db.settings.adminUsername || 'admin');
    const passwordOk = verifyPassword(body.password, db.settings.adminPasswordHash);
    if (!usernameOk || !passwordOk) {
      recordFailure(req);
      return sendJson(res, 401, { error: '账号或密码不正确' });
    }
    resetFailure(req);
    setSessionCookie(res, { role: 'admin' });
    return sendJson(res, 200, { ok: true, role: 'admin' });
  }

  if (pathname === '/api/admin/icon' && method === 'POST') {
    const session = requireRole(req, res, ['admin']);
    if (!session) return;
    const body = await readJson(req, 1200 * 1024);
    const dataUrl = String(body.data || '');
    const m = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return sendJson(res, 400, { error: '只支持 png / jpg / gif / webp / svg / ico 图片' });
    let buffer;
    try {
      buffer = Buffer.from(m[2], 'base64');
    } catch {
      return sendJson(res, 400, { error: '图片数据无法解析' });
    }
    if (!buffer.length || buffer.length > 512 * 1024) {
      return sendJson(res, 400, { error: '图片需小于 512 KB' });
    }
    const ext = detectImageExt(buffer);
    if (!ext) return sendJson(res, 400, { error: '文件内容不是有效的图片' });
    const name = `${crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)}.${ext}`;
    await fsp.writeFile(path.join(ICON_DIR, name), buffer, { mode: 0o600 });
    return sendJson(res, 200, { ok: true, url: `/icons/${name}` });
  }

  if (pathname === '/api/admin/data' && method === 'GET') {
    const session = requireRole(req, res, ['admin']);
    if (!session) return;
    return sendJson(res, 200, {
      settings: adminSettings(),
      categories: db.categories,
      items: db.items,
      vaultCount: db.vault.length,
      updatedAt: db.updatedAt || null
    });
  }

  if (pathname === '/api/admin/data' && method === 'PUT') {
    const session = requireRole(req, res, ['admin']);
    if (!session) return;
    const body = await readJson(req);
    const categories = normalizeCategories(body.categories);
    const items = normalizeItems(body.items, categories);
    const s = body.settings || {};
    db.categories = categories;
    db.items = items;
    db.settings.siteTitle = clip(s.siteTitle, 24) || 'Nebula Nav';
    db.settings.siteSubtitle = clip(s.siteSubtitle, 60);
    db.settings.footerNote = clip(s.footerNote, 120);
    db.settings.defaultMode = ['auto', 'lan', 'wan'].includes(s.defaultMode) ? s.defaultMode : 'lan';
    db.settings.showModeSwitch = s.showModeSwitch !== false;
    db.updatedAt = new Date().toISOString();
    await saveDb();
    return sendJson(res, 200, {
      ok: true,
      settings: adminSettings(),
      categories: db.categories,
      items: db.items,
      updatedAt: db.updatedAt
    });
  }

  if (pathname === '/api/admin/password' && method === 'POST') {
    const session = requireRole(req, res, ['admin']);
    if (!session) return;
    const body = await readJson(req);
    const role = body.role === 'admin' ? 'admin' : 'front';
    const next = String(body.newPassword || '');
    if (next.length < 6 || next.length > 64) {
      return sendJson(res, 400, { error: '新密码需 6–64 位' });
    }
    if (role === 'front') {
      if (!verifyPassword(body.currentPassword, db.settings.frontPasswordHash)) {
        recordFailure(req);
        return sendJson(res, 401, { error: '当前访问密码不正确' });
      }
      db.settings.frontPasswordHash = hashPassword(next);
    } else {
      if (!verifyPassword(body.currentPassword, db.settings.adminPasswordHash)) {
        recordFailure(req);
        return sendJson(res, 401, { error: '当前后台密码不正确' });
      }
      const username = clip(body.username, 32).trim();
      if (username) db.settings.adminUsername = username;
      db.settings.adminPasswordHash = hashPassword(next);
    }
    resetFailure(req);
    db.updatedAt = new Date().toISOString();
    await saveDb();
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, { error: 'not found' });
  }

  if ((method === 'GET' || method === 'HEAD') && pathname.startsWith('/icons/')) {
    return serveIcon(req, res, pathname);
  }

  if (method === 'GET' || method === 'HEAD') {
    return serveStatic(req, res, pathname);
  }

  sendJson(res, 405, { error: 'method not allowed' });
}

/* ------------------------------------------------------------------ 启动 */

function loadSecret() {
  if (process.env.SESSION_SECRET) {
    SESSION_SECRET = process.env.SESSION_SECRET;
    return;
  }
  if (fs.existsSync(SECRET_FILE)) {
    SESSION_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (SESSION_SECRET) return;
  }
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, SESSION_SECRET, { mode: 0o600 });
  log('已生成会话密钥:', SECRET_FILE);
}

loadDb();
loadSecret();

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    log('请求处理失败:', err && err.message);
    if (!res.headersSent) {
      sendJson(res, err && err.statusCode ? err.statusCode : 500, { error: '服务器内部错误' });
    } else {
      res.end();
    }
  });
});

server.listen(PORT, HOST, () => {
  log(`Nebula Nav 已启动: http://${HOST}:${PORT}`);
  log(`数据目录: ${DATA_DIR}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('正在退出...');
    saving.finally(() => process.exit(0));
  });
}
