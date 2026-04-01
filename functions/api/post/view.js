function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    // 🌟 修复1：兼容前台阅读(post_id)和后台编辑(id)的不同参数名
    const postId = Number(url.searchParams.get("id") || url.searchParams.get("post_id"));
    if (!postId) return json({ error: "缺少文章 ID 参数" }, 400);

    // 🌟 修复2：获取文章所有数据，加入防 500 崩溃机制
    let post;
    try {
      // 尝试带分类的联合查询
      post = await context.env.DB.prepare(`
        SELECT p.*, c.name as category_name 
        FROM posts p 
        LEFT JOIN categories c ON p.category_id = c.id 
        WHERE p.id = ?
      `).bind(postId).first();
    } catch (dbErr) {
      // 万一数据库未添加 categories 表，降级使用基础查询，防止页面崩溃卡死
      post = await context.env.DB.prepare(`SELECT * FROM posts WHERE id = ?`).bind(postId).first();
    }

    if (!post) return json({ error: "文章不存在或已被删除" }, 404);

    // 🌟 修复3：格式化标签，防止前端 JSON.parse 转换时报错
    if (post.tags && typeof post.tags === 'string') {
      try {
        post.tags = JSON.parse(post.tags);
      } catch (e) {
        post.tags = post.tags.split(',').filter(Boolean);
      }
    } else if (!post.tags) {
      post.tags = [];
    }

    // 🌟 修复4：独立执行统计数据更新，即使这部分出错也绝不影响文章内容展示
    try {
      await context.env.DB.prepare("UPDATE posts SET views = views + 1 WHERE id = ?").bind(postId).run();
      
      const todayKey = `today_views_${new Date().toISOString().slice(0, 10)}`;
      await context.env.DB.prepare(`
        INSERT INTO site_stats (key, value) VALUES ('total_views', '1')
        ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1
      `).run();
      
      await context.env.DB.prepare(`
        INSERT INTO site_stats (key, value) VALUES (?, '1')
        ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1
      `).bind(todayKey).run();
    } catch (statErr) {
      console.error("更新访问量统计失败 (可能缺失site_stats表):", statErr);
    }

    // 🌟 修复5 (最核心)：将包含标题、内容的完整 post 对象返回给前端！
    return json({ ok: true, post: post });

  } catch (err) {
    return json({ error: "服务器内部错误", detail: String(err.message || err) }, 500);
  }
}