// functions/api/admin/invitation/list.js
export async function onRequestGet(context) {
    try {
        const { results } = await context.env.DB.prepare("SELECT * FROM invitations ORDER BY created_at DESC").all();
        return Response.json({ data: results });
    } catch (e) {
        return Response.json({ error: "获取失败" }, { status: 500 });
    }
}