const hour = 3600000;
const gap = 5 * 60000;

// Store observations only. Rendering and camera interpolation never write into this history.
export function rememberReports(histories, reports, now=Date.now()) {
  for (const {id,time,latitude,longitude} of reports) {
    if (!validPoint(time,latitude,longitude) || time < now-hour) continue;
    const points=histories.get(id) || [];
    if (points.length && time <= points.at(-1).time) continue;
    points.push({time,latitude,longitude});
    histories.set(id,points);
  }
  for (const [id,points] of histories) {
    while (points.length && (points[0].time < now-hour || points.length>1000)) points.shift();
    if (!points.length) histories.delete(id);
  }
}

function validPoint(time,lat,lon) {
  return Number.isFinite(time) && Number.isFinite(lat) && Math.abs(lat)<=90 &&
    Number.isFinite(lon) && Math.abs(lon)<=180;
}

export function trailSegments(points, end, earliest=end-hour) {
  const byTime=new Map();
  for (const point of points) {
    if (point.time<earliest || point.time>end || !validPoint(point.time,point.latitude,point.longitude)) continue;
    const previous=byTime.get(point.time);
    byTime.set(point.time,{...point,breakBefore:previous?.breakBefore || point.breakBefore});
  }
  const segments=[];
  let previous;
  for (const point of [...byTime.values()].sort((a,b)=>a.time-b.time)) {
    if (!previous || point.breakBefore || point.time-previous.time>gap) segments.push([]);
    segments.at(-1).push(point);
    previous=point;
  }
  return segments;
}

export function readTrack(feature,id) {
  const p=feature?.properties;
  if (String(p?.mmsi)!==id) return [];
  const coordinates=feature.geometry?.type==='LineString'?feature.geometry.coordinates:
    feature.geometry?.type==='Point'?[feature.geometry.coordinates]:[];
  const breaks=new Set(p.breaks || []);
  return coordinates.flatMap((coordinate,i)=>{
    const [longitude,latitude]=coordinate;
    const time=Date.parse(p.times?.[i]);
    return validPoint(time,latitude,longitude)?[{time,latitude,longitude,breakBefore:breaks.has(i)}]:[];
  });
}

// Track responses identify contributing sources for a whole time window.
async function fetchWindow(id, from, to, signal) {
  const query=new URLSearchParams({from:new Date(from).toISOString(),to:new Date(to).toISOString(),interval:'30s'});
  const response=await fetch('https://ais.openwaters.io/v1/vessels/'+id+'/track?'+query,{signal});
  if (!response.ok) throw Error('Track unavailable');
  const feature=await response.json();
  if (!feature.geometry) return [];
  const sources=Object.keys(feature.attribution || {});
  const eligible=sources.length && sources.every(s=>/^(aishub|station|udp|mmsi|volunteer|kystverket|barentswatch|digitraffic)(:|$)/.test(s));
  return eligible?readTrack(feature,id):null;
}

export async function recentAisTrack(id, end, signal) {
  const start=end-hour;
  const whole=await fetchWindow(id,start,end,signal);
  if (whole!==null) return whole;
  // A mixed-source track has no per-point credits. Keep separately credited portions.
  const parts=await Promise.allSettled(Array.from({length:4},(_,i)=>
    fetchWindow(id,start+i*hour/4,start+(i+1)*hour/4,signal)));
  return parts.flatMap(part=>part.status==='fulfilled' && part.value ? part.value : []);
}
