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

function randomCode(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆字符 I/O/1/0
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => chars[b % chars.length]).join("");
}

export async function onRequestPost(context) {
  const admin = await requireAdmin(context);
  if (admin.error) return admin.error;

  try {
    const count = 10;
    const codes = new Set();
    while (codes.size < count) codes.add(randomCode(10));

    const toInsert = [...codes];
    for (const code of toInsert) {
      await context.env.DB.prepare(
        "INSERT OR IGNORE INTO invitation_codes (code, is_used, used_by) VALUES (?, 0, NULL)"
      ).bind(code).run();
    }

    return json({ ok: true, codes: toInsert });
  } catch (err) {
    return json({ error: "生成邀请码失败", detail: String(err.message || err) }, 500);
  }
}

