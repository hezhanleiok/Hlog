function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function toCovers(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const id = Number(url.searchParams.get("id"));

    if (id) {
      const row = await context.env.DB.prepare(
        `SELECT p.id, p.title, p.summary, p.content, p.cover_images, p.created_at, p.updated_at, u.display_name AS author_name
         FROM posts p
         JOIN users u ON u.id = p.author_id
         WHERE p.id = ?`
      ).bind(id).first();
      if (!row) return json({ error: "文章不存在" }, 404);
      row.covers = toCovers(row.cover_images);
      delete row.cover_images;
      return json({ post: row });
    }

    const { results } = await context.env.DB.prepare(
      `SELECT p.id, p.title, p.summary, p.content, p.cover_images, p.created_at, p.updated_at, u.display_name AS author_name
       FROM posts p
       JOIN users u ON u.id = p.author_id
       ORDER BY p.created_at DESC`
    ).all();

    const posts = results.map((r) => ({
      ...r,
      content: undefined,
      covers: toCovers(r.cover_images)
    })).map((r) => {
      delete r.cover_images;
      return r;
    });
    return json({ posts });
  } catch (err) {
    return json({ error: "获取文章失败", detail: String(err.message || err) }, 500);
  }
}
