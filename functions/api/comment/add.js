function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function requireAdmin(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const row = await context.env.DB.prepare(
    `SELECT u.id, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  if (!row) return null;
  return row.role === "admin" ? row : null;
}

function getIp(context) {
  return (
    context.request.headers.get("CF-Connecting-IP") ||
    context.request.headers.get("x-forwarded-for") ||
    ""
  );
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const postId = Number(body.post_id);
    const author_name = body.author_name == null ? null : String(body.author_name).trim();
    const author_email = body.author_email == null ? null : String(body.author_email).trim();
    const content = String(body.content || "").trim();

    if (!postId || !content) return json({ error: "参数不完整" }, 400);

    // 评论开关（仅允许 published 文章评论）
    const post = await context.env.DB.prepare(
      "SELECT allow_comments FROM posts WHERE id = ? AND status = 'published'"
    ).bind(postId).first();
    if (!post) return json({ error: "文章不存在" }, 404);
    if (Number(post.allow_comments ?? 1) !== 1) return json({ error: "评论已关闭" }, 403);

    const admin = await requireAdmin(context);
    const status = admin ? "approved" : "pending";

    await context.env.DB.prepare(
      `INSERT INTO comments (post_id, author_name, author_email, content, status, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(postId, author_name || null, author_email || null, content, status, getIp(context)).run();

    return json({ ok: true }, 201);
  } catch (err) {
    return json({ error: "发表评论失败", detail: String(err.message || err) }, 500);
  }
}

