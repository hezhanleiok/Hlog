export async function onRequestPost(context) {
  try {
    // 获取请求数据和数据库连接 (假设你的 D1 绑定名称是 DB，如果是其他的请替换)
    const { request, env } = context;
    const body = await request.json();
    const { content } = body;

    // 检查内容是否为空
    if (!content) {
      return new Response(JSON.stringify({ success: false, message: '公告内容不能为空' }), { 
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    // 插入数据库
    const stmt = env.DB.prepare(
      "INSERT INTO announcements (content) VALUES (?)"
    ).bind(content);
    
    await stmt.run();

    return new Response(JSON.stringify({ success: true, message: '发布成功' }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { 
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}