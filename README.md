# HLOG

HLOG 是一个完全基于 Cloudflare 免费生态构建的原创全栈博客项目，技术栈为：

- 前端：HTML + Tailwind CSS + Vanilla JS
- 后端：Cloudflare Pages Functions
- 数据库：Cloudflare D1（SQLite）

项目特点：

- 用户注册、登录、会话鉴权、普通用户/管理员角色区分
- 管理员发布/编辑/删除文章
- 首页自动轮播幻灯片（多封面图支持）
- 响应式卡片式首页布局（手机/PC 适配）
- 文章详情 + 评论系统（游客与登录用户均可评论）
- 清爽后台管理面板（Blogger 风格）

---

## 目录结构

```text
HLOG/
├── public/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   └── admin.html
├── functions/
│   └── api/
│       ├── register.js
│       ├── login.js
│       ├── post/
│       │   ├── create.js
│       │   └── list.js
│       └── comment/
│           ├── add.js
│           └── list.js
├── wrangler.toml
├── check-code.js
└── README.md
```

---

## D1 初始化 SQL

> 在 Cloudflare D1 中执行以下 SQL。

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  hidden_content TEXT,        -- 登录可见内容
  cover_url TEXT,             -- 封面图字段
  status TEXT DEFAULT 'published', -- published(发布), draft(草稿)
  views INTEGER DEFAULT 0,    -- 阅读量
  allow_comments INTEGER DEFAULT 1, -- 评论开关 (1开启, 0关闭)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 标签体系
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER,
  tag_id INTEGER,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 评论系统：支持审核与游客
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,
  author_name TEXT,           -- 昵称
  author_email TEXT,          -- 邮箱
  content TEXT NOT NULL,
  status TEXT DEFAULT 'approved', -- approved(已准), pending(待审), spam(垃圾)
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- 站点统计
CREATE TABLE IF NOT EXISTS site_stats (
  key TEXT PRIMARY KEY,
  value INTEGER DEFAULT 0
);

-- 邀请码系统
CREATE TABLE IF NOT EXISTS invitation_codes (
  code TEXT PRIMARY KEY,
  is_used INTEGER DEFAULT 0,
  used_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_status_created_at ON posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_views ON posts(views DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id_created_at ON comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
```

### 初始化管理员账号（示例）

建议先注册一个普通用户，再手动提升为管理员：

```sql
UPDATE users SET role = 'admin' WHERE username = 'your_admin_username';
```

---

## Cloudflare 部署步骤

1. 创建 D1 数据库并拿到 `database_id`
2. 将 `wrangler.toml` 中 `database_id` 替换为真实值
3. 在 Cloudflare Pages 绑定 D1（绑定名必须是 `DB`）
4. 将仓库连接到 GitHub 并启用 Pages 自动部署
5. 构建输出目录使用 `public`

---

## 本地代码核查

```bash
node check-code.js
```

核查内容：

- 必需文件与路径完整性
- API 导出函数是否存在
- 前端接口路径引用完整性
- JS 模块语法可加载性
- `wrangler.toml` 关键配置检查

---

## 开源建议

- 可在 GitHub `Issues` 中收集功能建议
- 推荐增加 `LICENSE`（如 MIT）
- 推荐增加 CI（如 GitHub Actions）自动运行 `node check-code.js`

---

## 说明

本项目为原创实现，目标是“一个仓库即可直接部署到 Cloudflare Pages + Pages Functions + D1”，适合学习、二次开发与开源分享。
