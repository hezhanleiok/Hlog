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

export async function onRequestPost(context) {
  try {
    const admin = await requireAdmin(context);
    if (admin.error) return admin.error;

    const body = await context.request.json();
    const userId = Number(body.user_id);
    if (!userId) return json({ error: "缺少 user_id" }, 400);

    const cols = await getColumns(context, "users");
    const disabledCol =
      cols.includes("is_disabled") ? "is_disabled" :
      cols.includes("disabled") ? "disabled" :
      cols.includes("status") ? "status" :
      null;

    if (!disabledCol) return json({ error: "users 表缺少 disabled 字段" }, 500);

    const current = await context.env.DB.prepare(`SELECT ${disabledCol} AS v FROM users WHERE id = ?`).bind(userId).first();
    if (!current) return json({ error: "用户不存在" }, 404);

    const wantDisabled = body.disabled == null ? null : !!body.disabled;
    let next;

    if (disabledCol === "status") {
      const cur = String(current.v || "");
      const curDisabled = ["disabled", "inactive", "banned"].includes(cur);
      const targetDisabled = wantDisabled == null ? !curDisabled : wantDisabled;
      next = targetDisabled ? "disabled" : "active";
    } else {
      const cur = Number(current.v || 0);
      const curDisabled = cur === 1;
      const targetDisabled = wantDisabled == null ? !curDisabled : wantDisabled;
      next = targetDisabled ? 1 : 0;
    }

    const result = await context.env.DB.prepare(`UPDATE users SET ${disabledCol} = ? WHERE id = ?`).bind(next, userId).run();
    if (!result.meta.changes) return json({ error: "更新失败" }, 400);
    return json({ ok: true });
  } catch (err) {
    return json({ error: "禁用/启用失败", detail: String(err.message || err) }, 500);
  }
}

