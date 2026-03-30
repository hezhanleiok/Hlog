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

function toTags(tagNames) {
  if (!tagNames) return [];
  const s = String(tagNames).trim();
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const id = Number(url.searchParams.get("id"));
    const sort = url.searchParams.get("sort") || "recent";
    const limit = Number(url.searchParams.get("limit") || 12);
    const q = String(url.searchParams.get("q") || "").trim();
    const tagId = Number(url.searchParams.get("tag_id") || "");
    const includeDrafts = String(url.searchParams.get("include_drafts") || "0") === "1";

    let admin = null;
    if (includeDrafts) {
      admin = await requireAdmin(context);
      if (admin.error) return admin.error;
    }

    if (id) {
      const row = await context.env.DB.prepare(
        `SELECT
           p.id,
           p.title,
           p.summary,
           p.content,
           p.hidden_content,
           p.cover_url,
           p.status,
           p.views,
           p.allow_comments,
           p.created_at,
           (SELECT GROUP_CONCAT(t.name, ',')
              FROM post_tags pt
              JOIN tags t ON t.id = pt.tag_id
             WHERE pt.post_id = p.id
           ) AS tag_names
         FROM posts p
         WHERE p.id = ?
           AND (p.status = 'published' OR ? = 1)`
      ).bind(id, includeDrafts ? 1 : 0).first();

      if (!row) return json({ error: "文章不存在" }, 404);

      return json({
        post: {
          ...row,
          tags: toTags(row.tag_names),
          tag_names: undefined
        }
      });
    }

    const where = [];
    const binds = [];

    // status filter for public
    where.push("(p.status = 'published' OR ? = 1)");
    binds.push(includeDrafts ? 1 : 0);

    if (q) {
      where.push("(p.title LIKE ? OR p.summary LIKE ?)");
      binds.push(`%${q}%`, `%${q}%`);
    }

    if (tagId) {
      where.push("EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_id = p.id AND pt.tag_id = ?)");
      binds.push(tagId);
    }

    const orderBy =
      sort === "views"
        ? "p.views DESC, p.created_at DESC"
        : "p.created_at DESC";

    const rows = await context.env.DB.prepare(
      `SELECT
         p.id,
         p.title,
         p.summary,
         p.cover_url,
         p.status,
         p.views,
         p.allow_comments,
         p.created_at,
         (SELECT GROUP_CONCAT(t.name, ',')
            FROM post_tags pt
            JOIN tags t ON t.id = pt.tag_id
           WHERE pt.post_id = p.id
         ) AS tag_names
       FROM posts p
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT ?`
    ).bind(...binds, limit).all();

    const posts = rows.results.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      cover_url: r.cover_url,
      created_at: r.created_at,
      views: r.views,
      allow_comments: r.allow_comments,
      status: r.status,
      tags: toTags(r.tag_names)
    }));

    return json({ posts });
  } catch (err) {
    return json({ error: "获取文章失败", detail: String(err.message || err) }, 500);
  }
}

