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

    const cols = await getColumns(context, "users");
    const emailCol = cols.includes("email") ? "email" : null;
    const avatarUrlCol = cols.includes("avatar_url") ? "avatar_url" : cols.includes("avatar") ? "avatar" : null;
    const createdAtCol = cols.includes("created_at")
      ? "created_at"
      : cols.includes("register_time")
        ? "register_time"
        : null;

    const disabledCol =
      cols.includes("is_disabled") ? "is_disabled" :
      cols.includes("disabled") ? "disabled" :
      cols.includes("status") ? "status" :
      null;

    let selectDisabledExpr = "0 AS disabled";
    if (disabledCol) {
      if (disabledCol === "status") selectDisabledExpr = `(CASE WHEN ${disabledCol} IN ('disabled','inactive','banned') THEN 1 ELSE 0 END) AS disabled`;
      else selectDisabledExpr = `${disabledCol} AS disabled`;
    }

    if (!emailCol) return json({ error: "users 表缺少 email 字段" }, 500);
    if (!cols.includes("display_name")) return json({ error: "users 表缺少 display_name 字段" }, 500);

    const limit = Math.min(Number(new URL(context.request.url).searchParams.get("limit") || 50), 200);

    const rows = await context.env.DB.prepare(
      `SELECT
         id,
         ${emailCol} AS email,
         display_name,
         ${avatarUrlCol ? `${avatarUrlCol} AS avatar_url` : "NULL AS avatar_url"},
         ${createdAtCol ? `${createdAtCol} AS created_at` : "NULL AS created_at"},
         ${selectDisabledExpr}
       FROM users
       ORDER BY ${createdAtCol || "id"} DESC
       LIMIT ?`
    ).bind(limit).all();

    return json({ users: rows.results || rows });
  } catch (err) {
    return json({ error: "获取用户列表失败", detail: String(err.message || err) }, 500);
  }
}

