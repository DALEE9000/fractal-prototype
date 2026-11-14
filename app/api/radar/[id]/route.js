import { findPort } from '../../../../lib/ports.js';
import { getRadar } from '../../../../lib/currents.js';
export async function GET(_,context) {
  const {id} = await context.params;
  if(!findPort(id)) return Response.json({error:'Unknown port'},{status:404});
  try { return Response.json({current:await getRadar(id)},{headers:{'Cache-Control':'public, s-maxage=600'}}); }
  catch { return Response.json({error:'Radar feed unavailable'},{status:503}); }
}
