/* 自动分类规则：按域名关键词、标题关键词给站点归到最合适的分类。
   规则从上到下匹配，命中即返回；全部未命中时返回 null。 */
window.AuroraTaxonomy = (function () {
  const RULES = [
    {
      id: 'media',
      words: ['emby', 'jellyfin', 'plex', 'moviepilot', 'qbittorrent', 'transmission', 'nastool',
        'bilibili', 'youtube', 'netflix', 'spotify', 'iyuu', 'openlist', 'alist', 'stream', '番剧', '影视']
    },
    {
      id: 'nas',
      words: ['synology', 'dsm', 'qnap', 'truenas', 'freenas', 'unraid', 'openwrt', 'istoreos',
        'adguard', 'pihole', 'lucky', 'cloudflare', 'tailscale', 'zerotier', 'vaultwarden',
        'home-assistant', 'homeassistant', 'nas', 'docker', 'dockge', 'portainer', '路由', '群晖']
    },
    {
      id: 'dev',
      words: ['github', 'gitlab', 'gitee', 'stackoverflow', 'npmjs', 'jsdelivr', 'developer.mozilla',
        'docs.', 'qinglong', 'vercel', 'cloudflare-pages', '代码', '开发', '文档']
    },
    {
      id: 'ai',
      words: ['openai', 'chatgpt', 'claude', 'gemini', 'huggingface', 'midjourney', 'perplexity',
        'modelscope', 'ai', '模型']
    },
    {
      id: 'info',
      words: ['v2ex', 'sspai', 'zhihu', 'weibo', 'douban', 'smzdm', 'reddit', 'news', 'rss',
        '少数派', '知乎', '资讯']
    },
    {
      id: 'work',
      words: ['feishu', 'lark', 'notion', 'yuque', 'obsidian', 'wikipedia', 'confluence', 'office',
        '文档', '笔记', '办公']
    }
  ];

  function hostOf(url) {
    try {
      return new URL(url).host.toLowerCase();
    } catch (e) {
      return String(url || '').toLowerCase();
    }
  }

  function guess(url, title) {
    const hay = `${hostOf(url)} ${String(title || '').toLowerCase()}`;
    for (const rule of RULES) {
      if (rule.words.some((w) => hay.includes(w))) return rule.id;
    }
    return null;
  }

  return { guess, RULES };
})();
