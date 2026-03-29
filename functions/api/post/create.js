function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function requireAdmin(context) {
  const auth = context.request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: json({ error: "未登录" }, 401) };

  const row = await context.env.DB.prepare(
    `SELECT u.id, u.role, u.display_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  if (!row) return { error: json({ error: "登录状态已失效" }, 401) };
  if (row.role !== "admin") return { error: json({ error: "仅管理员可操作" }, 403) };
  return { user: row };
}

function parseCovers(value) {
  if (!Array.isArray(value)) return [];
  return value.map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
}

export async function onRequest(context) {
  const auth = await requireAdmin(context);
  if (auth.error) return auth.error;

  try {
    const method = context.request.method.toUpperCase();
    const body = await context.request.json().catch(() => ({}));

    if (method === "POST") {
      const title = String(body.title || "").trim();
      const summary = String(body.summary || "").trim();
      const content = String(body.content || "").trim();
      const covers = JSON.stringify(parseCovers(body.covers));
      if (!title || !content) return json({ error: "标题和正文不能为空" }, 400);

      const result = await context.env.DB.prepare(
        "INSERT INTO posts (title, summary, content, cover_images, author_id) VALUES (?, ?, ?, ?, ?)"
      ).bind(title, summary, content, covers, auth.user.id).run();
      return json({ ok: true, id: result.meta.last_row_id }, 201);
    }

    if (method === "PUT") {
      const id = Number(body.id);
      const title = String(body.title || "").trim();
      const summary = String(body.summary || "").trim();
      const content = String(body.content || "").trim();
      const covers = JSON.stringify(parseCovers(body.covers));
      if (!id || !title || !content) return json({ error: "参数错误" }, 400);

      const result = await context.env.DB.prepare(
        "UPDATE posts SET title = ?, summary = ?, content = ?, cover_images = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(title, summary, content, covers, id).run();
      if (!result.meta.changes) return json({ error: "文章不存在" }, 404);
      return json({ ok: true });
    }

    if (method === "DELETE") {
      const id = Number(body.id);
      if (!id) return json({ error: "缺少文章 ID" }, 400);
      await context.env.DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(id).run();
      const result = await context.env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
      if (!result.meta.changes) return json({ error: "文章不存在" }, 404);
      return json({ ok: true });
    }

    return json({ error: "方法不允许" }, 405);
  } catch (err) {
    return json({ error: "文章操作失败", detail: String(err.message || err) }, 500);
  }
}
