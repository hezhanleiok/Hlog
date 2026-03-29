function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function getLoginUser(context) {
  const auth = context.request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  return context.env.DB.prepare(
    `SELECT u.id, u.display_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const postId = Number(body.post_id);
    const content = String(body.content || "").trim();
    const guestName = String(body.guest_name || "").trim();
    if (!postId || !content) return json({ error: "参数不完整" }, 400);

    const post = await context.env.DB.prepare("SELECT id FROM posts WHERE id = ?").bind(postId).first();
    if (!post) return json({ error: "文章不存在" }, 404);

    const user = await getLoginUser(context);
    const displayName = user ? user.display_name : (guestName || "游客");
    const userId = user ? user.id : null;

    await context.env.DB.prepare(
      "INSERT INTO comments (post_id, user_id, guest_name, content) VALUES (?, ?, ?, ?)"
    ).bind(postId, userId, displayName, content).run();

    return json({ ok: true }, 201);
  } catch (err) {
    return json({ error: "发表评论失败", detail: String(err.message || err) }, 500);
  }
}
