function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet(context) {
  try {
    const publishedRow = await context.env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM posts WHERE status = 'published'"
    ).first();
    const post_count = Number(publishedRow?.cnt ?? 0);

    const statRow = await context.env.DB.prepare("SELECT value FROM site_stats WHERE key = 'total_views'").first();
    const total_views = Number(statRow?.value ?? 0);

    return json({ post_count, total_views });
  } catch (err) {
    return json({ error: "获取站点统计失败", detail: String(err.message || err) }, 500);
  }
}

