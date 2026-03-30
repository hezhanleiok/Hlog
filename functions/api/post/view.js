function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const postId = Number(url.searchParams.get("post_id"));
    if (!postId) return json({ error: "缺少 post_id" }, 400);

    const exists = await context.env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(postId).first();
    if (!exists) return json({ error: "文章不存在" }, 404);

    await context.env.DB.prepare("UPDATE posts SET views = views + 1 WHERE id = ?").bind(postId).run();

    // 站点总访问量：key=total_views
    await context.env.DB.prepare(`
      INSERT INTO site_stats (key, value)
      VALUES ('total_views', 1)
      ON CONFLICT(key) DO UPDATE SET value = value + 1
    `).run();

    const row = await context.env.DB.prepare("SELECT views FROM posts WHERE id = ?").bind(postId).first();
    return json({ ok: true, views: Number(row?.views ?? 0) });
  } catch (err) {
    return json({ error: "增加访问量失败", detail: String(err.message || err) }, 500);
  }
}

