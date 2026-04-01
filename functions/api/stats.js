function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet(context) {
  try {
    const todayKey = `today_views_${new Date().toISOString().slice(0, 10)}`;

    const [todayRow, userRow, noticeRow] = await Promise.all([
      context.env.DB.prepare("SELECT value FROM site_stats WHERE key = ?").bind(todayKey).first(),
      context.env.DB.prepare("SELECT COUNT(*) AS c FROM users").first(),
      context.env.DB.prepare("SELECT value FROM site_stats WHERE key = 'site_notice'").first()
    ]);

    const tagsSql = `
      SELECT t.id, t.name, COUNT(DISTINCT p.id) AS post_count, COALESCE(SUM(p.views), 0) AS total_views
      FROM tags t
      JOIN post_tags pt ON pt.tag_id = t.id
      JOIN posts p ON p.id = pt.post_id
      WHERE p.status = 'published'
      GROUP BY t.id, t.name
      ORDER BY total_views DESC
      LIMIT 10
    `;
    const tagsRes = await context.env.DB.prepare(tagsSql).all();

    return json({
      ok: true,
      today_views: Number(todayRow?.value ?? 0),
      total_users: Number(userRow?.c ?? 0),
      site_notice: noticeRow?.value || "", // 返回数据库中的公告内容
      active_tags: (tagsRes.results || []).map((t) => ({ id: t.id, name: t.name, post_count: Number(t.post_count ?? 0) }))
    });
  } catch (err) {
    return json({ error: "获取统计失败", detail: String(err.message || err) }, 500);
  }
}