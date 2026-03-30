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
  return { admin: row };
}

async function getColumns(context, tableName) {
  const res = await context.env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return (res.results || []).map((r) => r.name);
}

export async function onRequestGet(context) {
  try {
    const admin = await requireAdmin(context);
    if (admin.error) return admin.error;

    const url = new URL(context.request.url);
    const status = String(url.searchParams.get("status") || "published").toLowerCase();

    const postsCols = await getColumns(context, "posts");
    if (!postsCols.length) return json({ error: "posts 表不存在或不可访问" }, 500);

    const coverCol = postsCols.includes("cover_url") ? "cover_url" : null;
    const createdAtCol = postsCols.includes("created_at") ? "created_at" : null;
    const viewsCol = postsCols.includes("views") ? "views" : null;

    if (!createdAtCol) return json({ error: "posts 表缺少 created_at 字段" }, 500);

    // 兼容：只允许 draft/published
    const targetStatus = status === "draft" ? "draft" : "published";

    const rows = await context.env.DB.prepare(
      `SELECT
        id,
        title,
        status,
        ${createdAtCol} AS created_at,
        ${viewsCol ? `${viewsCol}` : "0"} AS views${coverCol ? `, ${coverCol} AS cover_url` : ", NULL AS cover_url"}
       FROM posts
       WHERE status = ?
       ORDER BY ${createdAtCol} DESC
       LIMIT 200`
    ).bind(targetStatus).all();

    return json({ ok: true, posts: rows.results || rows });
  } catch (err) {
    return json({ error: "获取文章失败", detail: String(err.message || err) }, 500);
  }
}

