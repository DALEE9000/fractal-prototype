import { findPort } from '../../../../lib/ports.js';
import { getConditions } from '../../../../lib/marine.js';

export async function GET(_request, context) {
  const port = findPort((await context.params).id);
  if (!port) return Response.json({ error: 'Unknown port' }, { status: 404 });
  const conditions = await getConditions(port);
  return Response.json(conditions, { headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=120' } });
}
