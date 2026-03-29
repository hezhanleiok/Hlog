function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function sha256(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const username = String(body.username || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim();
    const password = String(body.password || "");

    if (!username || !displayName || !password) return json({ error: "参数不完整" }, 400);
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return json({ error: "用户名仅支持 3-20 位字母数字下划线" }, 400);
    if (password.length < 6) return json({ error: "密码至少 6 位" }, 400);

    const existed = await context.env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existed) return json({ error: "用户名已存在" }, 409);

    const passwordHash = await sha256(password);
    await context.env.DB.prepare(
      "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'user')"
    ).bind(username, displayName, passwordHash).run();

    return json({ ok: true, message: "注册成功" }, 201);
  } catch (err) {
    return json({ error: "注册失败", detail: String(err.message || err) }, 500);
  }
}
