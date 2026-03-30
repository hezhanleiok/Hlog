function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function getLoginUser(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  const row = await context.env.DB.prepare(
    `SELECT u.id, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();
  return row || null;
}

export async function onRequestGet(context) {
  try {
    const user = await getLoginUser(context);
    if (!user) return json({ error: "未登录或会话失效" }, 401);

    const postsCols = await context.env.DB.prepare("PRAGMA table_info(posts)").all();
    const cols = postsCols.results || [];
    const hasAuthorId = cols.some((c) => c.name === "author_id");

    const limit = Math.min(Number(new URL(context.request.url).searchParams.get("limit") || 30), 100);
    const isAdmin = user.role === "admin";

    const statusFilter = isAdmin ? "" : "AND status = 'published'";

    let rows;
    if (hasAuthorId) {
      rows = await context.env.DB.prepare(
        `SELECT id, title, status, created_at, views
         FROM posts
         WHERE author_id = ?
         ${statusFilter}
         ORDER BY created_at DESC
         LIMIT ?`
      ).bind(user.id, limit).all();
    } else {
      rows = await context.env.DB.prepare(
        `SELECT id, title, status, created_at, views
         FROM posts
         WHERE 1 = 1
         ${statusFilter}
         ORDER BY created_at DESC
         LIMIT ?`
      ).bind(limit).all();
    }

    return json({ posts: rows.results || rows });
  } catch (err) {
    return json({ error: "获取文章失败", detail: String(err.message || err) }, 500);
  }
}

