/* Nebula Nav · 极简 service worker
   只用于满足 PWA 可安装条件，不缓存任何响应，避免登录态与数据被旧缓存干扰。 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* 交给浏览器默认网络请求 */ });
