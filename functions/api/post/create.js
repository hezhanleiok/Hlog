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
  return [...new Set(ids)];
}

// 🌟 新增：触发 Cloudflare Pages 静态重新部署的函数
function triggerDeploy(context) {
  const hookUrl = "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/fdffadac-e9e6-42a7-b33e-11ded5edaeb0";
  // 使用 context.waitUntil 可以在后台异步发送请求，不阻塞当前接口返回给前端的速度
  context.waitUntil(
    fetch(hookUrl, { method: "POST" })
      .then(res => console.log("自动触发静态部署成功, 状态码:", res.status))
      .catch(err => console.error("自动触发静态部署失败:", err))
  );
}

export async function onRequest(context) {
  const auth = await requireAdmin(context);
  if (auth.error) return auth.error;

  try {
    const method = context.request.method.toUpperCase();
    const body = await context.request.json().catch(() => ({}));

    // 提取公共字段
    const title = String(body.title || "").trim();
    const summary = body.summary == null ? null : String(body.summary).trim();
    const content = String(body.content || "").trim();
    const hidden_content = body.hidden_content == null ? null : String(body.hidden_content).trim();
    const cover_url = body.cover_url == null ? null : String(body.cover_url).trim() || null;
    const status = body.status === "draft" ? "draft" : "published";
    const allow_comments = Number(body.allow_comments ?? 1) === 1 ? 1 : 0;
    // 🌟 核心修复：接收 category_id
    const category_id = body.category_id ? Number(body.category_id) : null; 

    if (method === "POST") {
      if (!title || !content) return json({ error: "标题和正文不能为空" }, 400);

      // 🌟 核心修复：插入语句增加 category_id
      const result = await context.env.DB.prepare(
        `INSERT INTO posts (title, summary, content, hidden_content, cover_url, status, views, allow_comments, category_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).bind(title, summary, content, hidden_content, cover_url, status, allow_comments, category_id).run();

      const postId = result.meta.last_row_id;

      const tagNames = normalizeTags(body.tags);
      if (tagNames.length) {
        const tagIds = await upsertTagIds(context, tagNames);
        await context.env.DB.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(postId).run();
        for (const tagId of tagIds) {
          await context.env.DB.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)").bind(postId, tagId).run();
        }
      }
      
      // 🌟 触发部署
      triggerDeploy(context);
      
      return json({ ok: true, id: postId }, 201);
    }

    if (method === "PUT") {
      const id = Number(body.id);
      if (!id) return json({ error: "缺少文章 ID" }, 400);
      if (!title || !content) return json({ error: "标题和正文不能为空" }, 400);

      // 🌟 核心修复：更新语句增加 category_id
      const result = await context.env.DB.prepare(
        `UPDATE posts
         SET title = ?, summary = ?, content = ?, hidden_content = ?, cover_url = ?, status = ?, allow_comments = ?, category_id = ?
         WHERE id = ?`
      ).bind(title, summary, content, hidden_content, cover_url, status, allow_comments, category_id, id).run();

      if (!result.meta.changes) return json({ error: "文章不存在" }, 404);

      const tagNames = normalizeTags(body.tags);
      await context.env.DB.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(id).run();
      if (tagNames.length) {
        const tagIds = await upsertTagIds(context, tagNames);
        for (const tagId of tagIds) {
          await context.env.DB.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)").bind(id, tagId).run();
        }
      }
      
      // 🌟 触发部署
      triggerDeploy(context);
      
      return json({ ok: true });
    }

    if (method === "DELETE") {
      const id = Number(body.id);
      if (!id) return json({ error: "缺少文章 ID" }, 400);

      await context.env.DB.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(id).run();
      await context.env.DB.prepare("DELETE FROM comments WHERE post_id = ?").bind(id).run();
      const result = await context.env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
      
      if (!result.meta.changes) return json({ error: "文章不存在" }, 404);
      
      // 🌟 触发部署
      triggerDeploy(context);
      
      return json({ ok: true });
    }

    return json({ error: "方法不允许" }, 405);
  } catch (err) {
    return json({ error: "文章操作失败", detail: String(err.message || err) }, 500);
  }
}