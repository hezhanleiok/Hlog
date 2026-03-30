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

  const userCols = await context.env.DB.prepare("PRAGMA table_info(users)").all();
  const cols = userCols.results || [];
  const hasAvatarUrl = cols.some((c) => c.name === "avatar_url");
  const hasAvatar = cols.some((c) => c.name === "avatar");
  const avatarCol = hasAvatarUrl ? "avatar_url" : hasAvatar ? "avatar" : null;

  const selectAvatar = avatarCol ? `u.${avatarCol} AS avatar_url` : "NULL AS avatar_url";

  const row = await context.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.role, ${selectAvatar}
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  return row || null;
}

export async function onRequestGet(context) {
  try {
    const user = await getLoginUser(context);
    if (!user) return json({ error: "未登录或会话已失效" }, 401);
    return json({ user });
  } catch (err) {
    return json({ error: "获取用户信息失败", detail: String(err.message || err) }, 500);
  }
}

