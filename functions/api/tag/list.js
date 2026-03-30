function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB.prepare(
      `SELECT
         t.id,
         t.name,
         COUNT(p.id) AS post_count
       FROM tags t
       LEFT JOIN post_tags pt ON pt.tag_id = t.id
       LEFT JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
       GROUP BY t.id, t.name
       ORDER BY post_count DESC, t.name ASC`
    ).all();

    return json({ tags: results.map((r) => ({ id: r.id, name: r.name, post_count: Number(r.post_count ?? 0) })) });
  } catch (err) {
    return json({ error: "获取标签失败", detail: String(err.message || err) }, 500);
  }
}

