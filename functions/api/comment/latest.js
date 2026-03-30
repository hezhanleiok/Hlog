function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet(context) {
  try {
    const limit = Number(new URL(context.request.url).searchParams.get("limit") || 10);
    const safeLimit = Math.min(Math.max(limit, 1), 20);

    const { results } = await context.env.DB.prepare(
      `SELECT
         c.id,
         c.author_name,
         c.author_email,
         c.content,
         c.created_at,
         p.title AS post_title
       FROM comments c
       JOIN posts p ON p.id = c.post_id
       WHERE c.status = 'approved'
         AND p.status = 'published'
       ORDER BY c.created_at DESC
       LIMIT ?`
    ).bind(safeLimit).all();

    const comments = results.map((c) => ({
      id: c.id,
      name: c.author_name,
      author_name: c.author_name,
      author_email: c.author_email,
      content: c.content,
      created_at: c.created_at,
      post_title: c.post_title
    }));

    return json({ comments });
  } catch (err) {
    return json({ error: "获取最新评论失败", detail: String(err.message || err) }, 500);
  }
}

