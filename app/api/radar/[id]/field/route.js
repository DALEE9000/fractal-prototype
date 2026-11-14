import { charts } from '../../../../../lib/chart-areas.js';
import { getRadarField } from '../../../../../lib/radar-field.js';
export async function GET(_,context){
  const {id}=await context.params;
  if(!Object.hasOwn(charts,id)||!charts[id].region)return Response.json({error:'No NOAA grid here'},{status:404});
  try{return Response.json(await getRadarField(id),{headers:{'Cache-Control':'public, s-maxage=300'}});}
  catch{return Response.json({error:'Radar grid unavailable'},{status:503});}
}
