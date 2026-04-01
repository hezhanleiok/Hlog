export async function onRequestGet(context) {
  try {
    const { env } = context;
    
    // 从数据库查询最新 3 条显示的公告
    const { results } = await env.DB.prepare(
      "SELECT content FROM announcements WHERE status = 1 ORDER BY created_at DESC LIMIT 3"
    ).all();

    return new Response(JSON.stringify({ success: true, data: results }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { 
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}