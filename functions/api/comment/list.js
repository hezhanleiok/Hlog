function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function onRequestGet(context) {
  try {
    const postId = Number(new URL(context.request.url).searchParams.get("post_id"));
    if (!postId) return json({ error: "缺少 post_id" }, 400);

    const { results } = await context.env.DB.prepare(
      `SELECT id, post_id, guest_name, content, created_at
       FROM comments
       WHERE post_id = ?
       ORDER BY created_at DESC`
    ).bind(postId).all();

    const comments = results.map((c) => ({
      ...c,
      name: c.guest_name || "游客"
    }));
    return json({ comments });
  } catch (err) {
    return json({ error: "获取评论失败", detail: String(err.message || err) }, 500);
  }
}
