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

export async function onRequestPost(context) {
  const admin = await requireAdmin(context);
  if (admin.error) return admin.error;

  try {
    const body = await context.request.json();
    const id = Number(body.id);
    if (!id) return json({ error: "缺少评论 ID" }, 400);

    const result = await context.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
    if (!result.meta.changes) return json({ error: "评论不存在" }, 404);
    return json({ ok: true });
  } catch (err) {
    return json({ error: "删除评论失败", detail: String(err.message || err) }, 500);
  }
}

