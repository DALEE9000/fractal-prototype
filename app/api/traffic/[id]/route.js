import gtfs from 'gtfs-realtime-bindings';
import { harbors, visibleReports } from '../../../../lib/traffic.js';

export async function GET(_,context) {
  const {id}=await context.params;
  const area=harbors[id];
  if(!area?.provider) return Response.json({error:'No live operator feed configured'},{status:404});
  try {
    const ny=id==='new-york';
    const url=ny?'https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/vehicleposition':'https://api-v3.mbta.com/vehicles?filter%5Broute_type%5D=4';
    const res=await fetch(url,{next:{revalidate:20},signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw Error();
    let reports;
    if(ny){
      const feed=gtfs.transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
      reports=feed.entity.filter(e=>e.vehicle?.position).map(({id,vehicle:v})=>({
        id:v.vehicle?.id||id,name:v.vehicle?.label||v.vehicle?.id||id,
        latitude:v.position.latitude,longitude:v.position.longitude,
        bearing:Object.hasOwn(v.position,'bearing')?v.position.bearing:null,time:Number(v.timestamp || feed.header.timestamp)*1000
      }));
    }else{
      const json=await res.json();
      reports=json.data.map(({id,attributes:a})=>({id,name:a.label||id,latitude:a.latitude,longitude:a.longitude,bearing:a.bearing,time:Date.parse(a.updated_at)}));
    }
    return Response.json({vessels:visibleReports(reports,area.bounds)},{headers:{'Cache-Control':'public, s-maxage=20'}});
  }catch{return Response.json({error:'Vessel feed temporarily unavailable.'},{status:503});}
}
