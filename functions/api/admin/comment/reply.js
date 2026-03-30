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

export async function onRequestPost(context) {
  try {
    const admin = await requireAdmin(context);
    if (admin.error) return admin.error;

    const body = await context.request.json();
    const id = Number(body.id);
    const reply = String(body.reply || "").trim();
    if (!id || !reply) return json({ error: "缺少 id 或回复内容" }, 400);

    const row = await context.env.DB.prepare("SELECT content FROM comments WHERE id = ?").bind(id).first();
    if (!row) return json({ error: "评论不存在" }, 404);

    const nextContent = String(row.content || "") + `\n\n管理员回复：${reply}`;

    await context.env.DB.prepare(
      "UPDATE comments SET status = 'approved', content = ? WHERE id = ?"
    ).bind(nextContent, id).run();

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: "快捷回复失败", detail: String(err.message || err) }, 500);
  }
}

