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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getTableColumns(context, tableName) {
  const res = await context.env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return (res.results || []).map((r) => r.name);
}

async function verifyEmailCode(context, email, code) {
  const cols = await getTableColumns(context, "email_codes").catch(() => []);
  if (!cols.length) throw new Error("email_codes 表不存在");
  if (!cols.includes("email") || !cols.includes("code") || !cols.includes("expires_at")) {
    throw new Error("email_codes 表字段不足（需 email/code/expires_at）");
  }

  const row = await context.env.DB.prepare(
    "SELECT email, code, expires_at FROM email_codes WHERE email = ? AND code = ? AND expires_at > datetime('now')"
  ).bind(email, code).first();

  if (!row) return false;

  // One-time use: delete after verify
  await context.env.DB.prepare("DELETE FROM email_codes WHERE email = ? AND code = ?").bind(email, code).run();
  return true;
}

async function verifyInvitation(context, invitationCode, usedBy) {
  if (!invitationCode) return { ok: true, used: false };

  const cols = await getTableColumns(context, "invitation_codes").catch(() => []);
  if (!cols.length) return { ok: false, error: "invitation_codes 表不存在" };

  const row = await context.env.DB.prepare(
    "SELECT code, is_used FROM invitation_codes WHERE code = ? AND is_used = 0"
  ).bind(invitationCode).first();
  if (!row) return { ok: false, error: "邀请码无效或已被使用" };

  await context.env.DB.prepare(
    "UPDATE invitation_codes SET is_used = 1, used_by = ? WHERE code = ?"
  ).bind(usedBy || null, invitationCode).run();

  return { ok: true, used: true };
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const username = String(body.username || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim();
    const password = String(body.password || "");
    const email = String(body.email || "").trim().toLowerCase();
    const emailCode = String(body.email_code || "").trim();
    const invitationCode = body.invitation_code == null ? "" : String(body.invitation_code).trim();

    if (!username || !displayName || !password || !email || !emailCode) return json({ error: "参数不完整" }, 400);
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return json({ error: "用户名仅支持 3-20 位字母数字下划线" }, 400);
    if (password.length < 6) return json({ error: "密码至少 6 位" }, 400);
    if (!isValidEmail(email)) return json({ error: "邮箱格式不正确" }, 400);
    if (!/^[0-9]{6}$/.test(emailCode)) return json({ error: "验证码格式不正确" }, 400);

    const okCode = await verifyEmailCode(context, email, emailCode);
    if (!okCode) return json({ error: "验证码无效或已过期" }, 400);

    const requireInvite = String(context.env.REQUIRE_INVITE_CODE || "").toLowerCase() === "1";
    if (requireInvite && !invitationCode) return json({ error: "邀请码必填" }, 400);
    if (invitationCode) {
      const inv = await verifyInvitation(context, invitationCode, username);
      if (!inv.ok) return json({ error: inv.error || "邀请码无效" }, 400);
    }

    const existed = await context.env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existed) return json({ error: "用户名已存在" }, 409);

    const passwordHash = await sha256(password);

    const cols = await getTableColumns(context, "users");
    if (!cols.includes("email")) return json({ error: "users 表缺少 email 字段，请先更新表结构" }, 500);
    if (!cols.includes("password_hash")) return json({ error: "users 表缺少 password_hash 字段，请先更新表结构" }, 500);

    // Avoid duplicate email
    const emailExists = await context.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (emailExists) return json({ error: "邮箱已被注册" }, 409);

    await context.env.DB.prepare(
      "INSERT INTO users (username, display_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'user')"
    ).bind(username, displayName, email, passwordHash).run();

    return json({ ok: true, message: "注册成功" }, 201);
  } catch (err) {
    return json({ error: "注册失败", detail: String(err.message || err) }, 500);
  }
}
