function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function sha256(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

export async function onRequestPost(context) {
  try {
    const user = await getLoginUser(context);
    if (!user) return json({ error: "未登录或会话失效" }, 401);

    const body = await context.request.json();
    const display_name = body.display_name == null ? null : String(body.display_name).trim();
    const password = body.password == null ? "" : String(body.password);
    const avatar_url = body.avatar_url == null ? null : String(body.avatar_url).trim();

    if (!display_name) return json({ error: "display_name不能为空" }, 400);
    if (password && password.length < 6) return json({ error: "密码至少 6 位" }, 400);

    const userCols = await context.env.DB.prepare("PRAGMA table_info(users)").all();
    const cols = userCols.results || [];
    const hasAvatarUrl = cols.some((c) => c.name === "avatar_url");
    const hasAvatar = cols.some((c) => c.name === "avatar");
    const avatarCol = hasAvatarUrl ? "avatar_url" : hasAvatar ? "avatar" : null;

    const setParts = ["display_name = ?"];
    const binds = [display_name];

    if (avatarCol && avatar_url) {
      setParts.push(\`\${avatarCol} = ?\`);
      binds.push(avatar_url);
    }

    if (password) {
      const password_hash = await sha256(password);
      setParts.push("password_hash = ?");
      binds.push(password_hash);
    }

    const sql = \`UPDATE users SET \${setParts.join(", ")} WHERE id = ?\`;
    binds.push(user.id);

    const result = await context.env.DB.prepare(sql).bind(...binds).run();
    if (!result.meta.changes) return json({ error: "用户更新失败（无变化）" }, 400);

    return json({ ok: true, warnings: [] }, 200);
  } catch (err) {
    return json({ error: "更新用户失败", detail: String(err.message || err) }, 500);
  }
}

