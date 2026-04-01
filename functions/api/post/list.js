function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const catId = url.searchParams.get("cat_id");
    const tagId = url.searchParams.get("tag_id");
    const limit = Number(url.searchParams.get("limit") || 12);

    const where = ["(p.status = 'published')"];
    const binds = [];

    if (catId) {
      where.push("p.category_id = ?");
      binds.push(Number(catId));
    }
    
    // ... 原有 tagId 逻辑 ...

    const rows = await context.env.DB.prepare(`
      SELECT p.*, c.name as category_name
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${where.join(" AND ")}
      ORDER BY p.created_at DESC LIMIT ?
    `).bind(...binds, limit).all();

    return json({ posts: rows.results || [] });
  } catch (err) {
    return json({ error: "列表获取失败", detail: String(err.message) }, 500);
  }
}