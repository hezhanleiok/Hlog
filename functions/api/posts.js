// functions/api/posts.js
export async function onRequest(context) {
  try {
    const authHeader = context.request.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return Response.json({ error: "未登录" }, { status: 401 });

    const url = new URL(context.request.url);
    const status = url.searchParams.get("status") || "published"; // 获取请求的状态

    // 根据 status 严格过滤
    const { results } = await context.env.DB.prepare(
      "SELECT id, title, status, views, created_at FROM posts WHERE status = ? ORDER BY created_at DESC"
    ).bind(status).all();

    return Response.json({ posts: results });
  } catch (err) {
    return Response.json({ error: "获取列表失败" }, { status: 500 });
  }
}