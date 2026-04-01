// functions/api/admin/invitation/generate.js
function generateRandomCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({length}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function onRequestPost(context) {
  try {
    const auth = context.request.headers.get("Authorization");
    if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

    const body = await context.request.json().catch(() => ({}));
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 20); // 一次最多生成20个

    const codes = [];
    for(let i=0; i<count; i++){
        const code = generateRandomCode(8);
        await context.env.DB.prepare("INSERT INTO invitations (code, status) VALUES (?, 0)").bind(code).run();
        codes.push({ code, status: 0 });
    }

    return Response.json({ success: true, data: codes });
  } catch (err) {
    return Response.json({ error: "生成失败" }, { status: 500 });
  }
}