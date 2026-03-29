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

function randomToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!username || !password) return json({ error: "用户名或密码不能为空" }, 400);

    const user = await context.env.DB.prepare(
      "SELECT id, username, display_name, password_hash, role FROM users WHERE username = ?"
    ).bind(username).first();
    if (!user) return json({ error: "账号不存在" }, 404);

    const passwordHash = await sha256(password);
    if (passwordHash !== user.password_hash) return json({ error: "密码错误" }, 401);

    const token = randomToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    await context.env.DB.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)")
      .bind(user.id, token, expiresAt)
      .run();

    return json({
      token,
      role: user.role,
      user_id: user.id,
      username: user.username,
      display_name: user.display_name
    });
  } catch (err) {
    return json({ error: "登录失败", detail: String(err.message || err) }, 500);
  }
}
