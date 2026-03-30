// 辅助函数：统一 JSON 返回格式
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

// 辅助函数：SHA-256 加密
async function sha256(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 辅助函数：获取当前登录用户
async function getLoginUser(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  
  const row = await context.env.DB.prepare(
    "SELECT u.id, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > datetime('now')"
  ).bind(token).first();
  
  return row || null;
}

export async function onRequestPost(context) {
  try {
    const user = await getLoginUser(context);
    if (!user) return json({ error: "未登录或会话失效" }, 401);

    const body = await context.request.json();
    
    // 兼容处理：前端可能传 display_name 或 nickname
    const nickname = (body.nickname || body.display_name || "").toString().trim();
    const password = body.password ? String(body.password) : "";
    const avatar_url = (body.avatar_url || "").toString().trim();

    // 获取数据库表结构，自动适配字段名
    const userCols = await context.env.DB.prepare("PRAGMA table_info(users)").all();
    const cols = userCols.results || [];
    
    const hasNickname = cols.some(c => c.name === "nickname");
    const hasAvatarUrl = cols.some(c => c.name === "avatar_url");
    const hasAvatar = cols.some(c => c.name === "avatar");
    const hasPwdHash = cols.some(c => c.name === "password_hash");

    let setParts = [];
    let binds = [];

    // 1. 处理昵称
    if (nickname) {
      const colName = hasNickname ? "nickname" : "username";
      setParts.push(colName + " = ?");
      binds.push(nickname);
    }

    // 2. 处理头像
    if (avatar_url) {
      const colName = hasAvatarUrl ? "avatar_url" : (hasAvatar ? "avatar" : null);
      if (colName) {
        setParts.push(colName + " = ?");
        binds.push(avatar_url);
      }
    }

    // 3. 处理密码
    if (password) {
      if (password.length < 6) return json({ error: "密码至少 6 位" }, 400);
      const password_hash = await sha256(password);
      const colName = hasPwdHash ? "password_hash" : "password";
      setParts.push(colName + " = ?");
      binds.push(password_hash);
    }

    if (setParts.length === 0) {
      return json({ error: "没有需要更新的内容" }, 400);
    }

    // --- 核心修复：彻底放弃反斜杠和反引号的组合，使用纯字符串拼接 ---
    const sqlBase = "UPDATE users SET ";
    const sqlFields = setParts.join(", ");
    const sqlEnd = " WHERE id = ?";
    const sql = sqlBase + sqlFields + sqlEnd;
    
    binds.push(user.id);

    const result = await context.env.DB.prepare(sql).bind(...binds).run();
    
    // meta.changes 为 0 可能是因为用户提交了和原数据一模一样的内容
    return json({ ok: true, message: "个人资料更新成功" }, 200);

  } catch (err) {
    return json({ error: "服务器内部错误", detail: String(err.message || err) }, 500);
  }
}
