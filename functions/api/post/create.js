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
    `SELECT u.id, u.role, u.display_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  if (!row) return { error: json({ error: "登录状态已失效" }, 401) };
  if (row.role !== "admin") return { error: json({ error: "仅管理员可操作" }, 403) };
  return { user: row };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
}

async function upsertTagIds(context, tagNames) {
  const ids = [];
  for (const name of tagNames) {
    await context.env.DB.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").bind(name).run();
    const row = await context.env.DB.prepare("SELECT id FROM tags WHERE name = ?").bind(name).first();
    if (row?.id) ids.push(row.id);
  }
  // 去重
  return [...new Set(ids)];
}

export async function onRequest(context) {
  const auth = await requireAdmin(context);
  if (auth.error) return auth.error;

  try {
    const method = context.request.method.toUpperCase();
    const body = await context.request.json().catch(() => ({}));

    if (method === "POST") {
      const title = String(body.title || "").trim();
      const summary = body.summary == null ? null : String(body.summary).trim();
      const content = String(body.content || "").trim();
      const hidden_content = body.hidden_content == null ? null : String(body.hidden_content).trim();
      const cover_url = body.cover_url == null ? null : String(body.cover_url).trim() || null;
      const status = body.status === "draft" ? "draft" : "published";
      const allow_comments = Number(body.allow_comments ?? 1) === 1 ? 1 : 0;

      if (!title || !content) return json({ error: "标题和正文不能为空" }, 400);

      const result = await context.env.DB.prepare(
        `INSERT INTO posts (title, summary, content, hidden_content, cover_url, status, views, allow_comments)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
      ).bind(title, summary, content, hidden_content, cover_url, status, allow_comments).run();

      const postId = result.meta.last_row_id;

      const tagNames = normalizeTags(body.tags);
      if (tagNames.length) {
        const tagIds = await upsertTagIds(context, tagNames);
        await context.env.DB.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(postId).run();
        for (const tagId of tagIds) {
          await context.env.DB.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)").bind(postId, tagId).run();
        }
      }

      return json({ ok: true, id: postId }, 201);
    }

    if (method === "PUT") {
      const id = Number(body.id);
      if (!id) return json({ error: "缺少文章 ID" }, 400);

      const title = String(body.title || "").trim();
      const summary = body.summary == null ? null : String(body.summary).trim();
      const content = String(body.content || "").trim();
      const hidden_content = body.hidden_content == null ? null : String(body.hidden_content).trim();
      const cover_url = body.cover_url == null ? null : String(body.cover_url).trim() || null;
      const status = body.status === "draft" ? "draft" : "published";
      const allow_comments = Number(body.allow_comments ?? 1) === 1 ? 1 : 0;

      if (!title || !content) return json({ error: "标题和正文不能为空" }, 400);

      const result = await context.env.DB.prepare(
        `UPDATE posts
         SET title = ?, summary = ?, content = ?, hidden_content = ?, cover_url = ?, status = ?, allow_comments = ?
         WHERE id = ?`
      ).bind(title, summary, content, hidden_content, cover_url, status, allow_comments, id).run();

      if (!result.meta.changes) return json({ error: "文章不存在" }, 404);

      const tagNames = normalizeTags(body.tags);
      await context.env.DB.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(id).run();
      if (tagNames.length) {
        const tagIds = await upsertTagIds(context, tagNames);
        for (const tagId of tagIds) {
          await context.env.DB.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)").bind(id, tagId).run();
        }
      }

      return json({ ok: true });
    }

    if (method === "DELETE") {
      const id = Number(body.id);
      if (!id) return json({ error: "缺少文章 ID" }, 400);

      await context.env.DB.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(id).run();
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

