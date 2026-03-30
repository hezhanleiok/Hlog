function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomDigits(len = 6) {
  const digits = "0123456789";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => digits[b % 10]).join("");
}

async function getTableColumns(context, tableName) {
  const res = await context.env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  return (res.results || []).map((r) => r.name);
}

async function upsertEmailCode(context, email, code, expiresAtIso) {
  const cols = await getTableColumns(context, "email_codes").catch(() => []);
  if (!cols.length) throw new Error("email_codes 表不存在，请先建表。");

  // Prefer replace by deleting previous codes for the email.
  if (cols.includes("email")) {
    await context.env.DB.prepare("DELETE FROM email_codes WHERE email = ?").bind(email).run();
  }

  const insertCols = [];
  const binds = [];
  const values = [];

  const maybePush = (col, val) => {
    if (cols.includes(col)) {
      insertCols.push(col);
      binds.push(val);
      values.push("?");
    }
  };

  maybePush("email", email);
  maybePush("code", code);
  maybePush("expires_at", expiresAtIso);
  // created_at is optional; let DB default handle it if exists

  if (!insertCols.length) throw new Error("email_codes 表字段不匹配，无法写入验证码。");

  const sql = `INSERT INTO email_codes (${insertCols.join(",")}) VALUES (${values.join(",")})`;
  await context.env.DB.prepare(sql).bind(...binds).run();
}

async function sendResendEmail(context, email, code) {
  const apiKey = context.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("缺少环境变量 RESEND_API_KEY");

  const text = `【HLOG 博客】您的注册验证码为：${code}，5分钟内有效。`;
  const subject = "HLOG 注册验证码";

  const payload = {
    from: "onboarding@resend.dev",
    to: [email],
    subject,
    text
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Resend 发信失败，status=${res.status}`);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !isValidEmail(email)) return json({ error: "邮箱格式不正确" }, 400);

    const code = randomDigits(6);
    const expiresAtIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await upsertEmailCode(context, email, code, expiresAtIso);
    await sendResendEmail(context, email, code);

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: "发送验证码失败", detail: String(err.message || err) }, 500);
  }
}

