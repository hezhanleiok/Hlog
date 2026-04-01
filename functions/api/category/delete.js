export async function onRequestDelete(context) {
  try {
    const { id } = await context.request.json();
    await context.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}