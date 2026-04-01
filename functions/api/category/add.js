export async function onRequestPost(context) {
  try {
    const { name } = await context.request.json();
    if (!name) return new Response(JSON.stringify({ error: "名称不能为空" }), { status: 400 });
    await context.env.DB.prepare("INSERT INTO categories (name) VALUES (?)").bind(name).run();
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}