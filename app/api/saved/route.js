import { database } from '../../../lib/db.js';
import { getAuth } from '../../../lib/auth.js';
import { findPort } from '../../../lib/ports.js';

async function saved(request) {
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const { data: session } = await getAuth().getSession();
  if (!session?.user?.id) return Response.json({ error: 'Sign in to view your saved ports.' }, { status: 401 });
  const db = database();
  const owner = session.user.id;
  if (request.method === 'GET') {
    const result = await db.query('SELECT port_id FROM saved_ports WHERE user_id = $1 ORDER BY saved_at DESC, port_id', [owner]);
    return Response.json(result.rows.map(row => row.port_id), { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const body = await request.json().catch(() => null);
  if (!findPort(body?.port)) return Response.json({ error: 'Choose a supported port.' }, { status: 400 });
  if (request.method === 'PUT') {
    await db.query('INSERT INTO saved_ports (user_id, port_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [owner, body.port]);
  } else {
    await db.query('DELETE FROM saved_ports WHERE user_id = $1 AND port_id = $2', [owner, body.port]);
  }
  return new Response(null, { status: 204 });
}
export { saved as GET, saved as PUT, saved as DELETE };
