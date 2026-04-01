const fs = require('fs');
const path = require('path');

async function generateStaticFiles() {
  // 从 Cloudflare 环境变量获取你的博客线上地址（例如：https://hlog.pages.dev）
  const SITE_URL = process.env.SITE_URL;
  
  if (!SITE_URL) {
    console.warn("⚠️ 未配置 SITE_URL 环境变量，跳过静态生成，将继续使用动态 API。");
    return;
  }

  console.log(`🚀 开始从 ${SITE_URL} 获取数据并生成静态 JSON...`);
  
  // 确保 public/static 目录存在
  const staticDir = path.join(__dirname, 'public', 'static');
  if (!fs.existsSync(staticDir)) {
    fs.mkdirSync(staticDir, { recursive: true });
  }

  // 需要静态化的接口列表（对应 index.html 中的高频请求）
  const endpoints = [
    { url: '/api/category/list', file: 'category-list.json' },
    { url: '/api/stats', file: 'stats.json' },
    { url: '/api/site/stats', file: 'site-stats.json' },
    { url: '/api/admin/announcement/latest', file: 'announcement-latest.json' },
    { url: '/api/post/list?limit=15&sort=recent', file: 'post-list-recent.json' },
    { url: '/api/post/list?sort=views&limit=5', file: 'post-list-views.json' },
    { url: '/api/comment/latest?limit=4', file: 'comment-latest.json' },
    { url: '/api/tag/list', file: 'tag-list.json' }
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${SITE_URL}${ep.url}`);
      if (!res.ok) throw new Error(`HTTP 状态码: ${res.status}`);
      const data = await res.json();
      
      // 写入 JSON 到 public/static 目录
      fs.writeFileSync(path.join(staticDir, ep.file), JSON.stringify(data));
      console.log(`✅ 成功生成静态文件: static/${ep.file}`);
    } catch (err) {
      console.error(`❌ 生成失败: ${ep.url} - ${err.message}`);
    }
  }
}

generateStaticFiles();