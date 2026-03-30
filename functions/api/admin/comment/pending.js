function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function requireAdmin(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { error: json({ error: "未登录" }, 401) };

  const row = await context.env.DB.prepare(
    `SELECT u.id, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  if (!row) return { error: json({ error: "登录状态已失效" }, 401) };
  if (row.role !== "admin") return { error: json({ error: "仅管理员可操作" }, 403) };
  return { user: row };
}

export async function onRequestGet(context) {
  const admin = await requireAdmin(context);
  if (admin.error) return admin.error;

  try {
    const limit = Math.min(Number(new URL(context.request.url).searchParams.get("limit") || 50), 200);
    const { results } = await context.env.DB.prepare(
      `SELECT
         c.id,
         c.post_id,
         c.author_name,
         c.author_email,
         c.content,
         c.status,
         c.created_at,
         p.title AS post_title
       FROM comments c
       JOIN posts p ON p.id = c.post_id
       WHERE c.status = 'pending'
       ORDER BY c.created_at DESC
       LIMIT ?`
    ).bind(limit).all();

    return json({ comments: results });
  } catch (err) {
    return json({ error: "获取待审核评论失败", detail: String(err.message || err) }, 500);
  }
}

