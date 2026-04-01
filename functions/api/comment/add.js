// functions/api/comment/add.js
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { post_id, name, email, content } = body;
    if (!post_id || !name || !email || !content) return Response.json({ error: "信息不完整" }, { status: 400 });

    // 自动为用户分配随机背景的 UI Avatar
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;

    // status = 1 表示免审核，直接对外显示
    await context.env.DB.prepare(
      "INSERT INTO comments (post_id, name, email, content, status) VALUES (?, ?, ?, ?, 1)"
    ).bind(post_id, name, email, content).run();
    
    // 如果你表里有 avatar 字段可以用，没有的话前端也能自己通过 name 再次生成
    
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: "评论发布失败" }, { status: 500 });
  }
}