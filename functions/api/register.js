// functions/api/register.js
export async function onRequestPost(context) {
  try {
    const { username, password, inviteCode } = await context.request.json();
    if (!username || !password || !inviteCode) return Response.json({ error: "信息填写不完整" }, { status: 400 });

    // 校验邀请码
    const invite = await context.env.DB.prepare("SELECT * FROM invitations WHERE code = ?").bind(inviteCode).first();
    if (!invite) return Response.json({ error: "邀请码不存在" }, { status: 400 });
    if (invite.status !== 0) return Response.json({ error: "该邀请码已被使用" }, { status: 400 });

    const existing = await context.env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return Response.json({ error: "用户名已存在" }, { status: 400 });

    // 创建用户并标记邀请码为已使用 (status = 1)
    await context.env.DB.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')").bind(username, password).run();
    await context.env.DB.prepare("UPDATE invitations SET status = 1 WHERE code = ?").bind(inviteCode).run();

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}