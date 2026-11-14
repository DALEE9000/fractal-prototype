import gtfs from 'gtfs-realtime-bindings';
import { harbors, visibleReports } from '../../../../lib/traffic.js';

export async function GET(_,context) {
  const {id}=await context.params;
  const area=harbors[id];
  if(!area?.provider) return Response.json({error:'No live operator feed configured'},{status:404});
  try {
    if(area.ais){
      const response=await fetch('https://meri.digitraffic.fi/api/ais/v1/locations?latitude=60.15&longitude=24.98&radius=14',{
        headers:{'Digitraffic-User':'HarborLedger/1.0 (harbor-ledger-wine.vercel.app)'},next:{revalidate:30},signal:AbortSignal.timeout(10000)
      });
      if(!response.ok)throw Error();
      const data=await response.json();
      const reports=data.features.map(({mmsi,geometry,properties:p})=>({
        id:String(mmsi),name:'MMSI '+mmsi,latitude:geometry.coordinates[1],longitude:geometry.coordinates[0],
        bearing:p.heading!=null && p.heading>=0 && p.heading<360?p.heading:(p.cog>=0 && p.cog<360?p.cog:null),
        time:p.timestampExternal
      }));
      return Response.json({vessels:visibleReports(reports,area.bounds)},{headers:{'Cache-Control':'public, s-maxage=30'}});
    }
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
