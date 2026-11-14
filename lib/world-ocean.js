export const oceanPlaces = {
  world:{label:'World ocean',center:[15,8],zoom:2},
  rotterdam:{label:'Rotterdam',center:[51.98,4.05],zoom:10},
  singapore:{label:'Singapore Strait',center:[1.22,103.84],zoom:10},
  atlantic:{label:'North Atlantic',center:[30,-40],zoom:5},
  pacific:{label:'Pacific date line',center:[0,180],zoom:6},
  'new-york':{label:'New York',center:[40.51,-73.93],zoom:10},
  boston:{label:'Boston',center:[42.34,-70.87],zoom:10},
  'san-francisco':{label:'San Francisco',center:[37.79,-122.53],zoom:10}
};
export const wrapLon = lon=>((lon+180)%360+360)%360-180;
export const adjacentLon = (lon,reference)=>lon+360*Math.round((reference-lon)/360);

// Quantize the subscription so small pans and camera-follow updates reuse the stream.
export function vesselWindow([w,s,e,n],zoom){
  if(zoom<8 || e-w>12 || (e-w)*(n-s)>70)return '';
  const step=Math.max(.125,2**Math.ceil(Math.log2((e-w)/4)));
  const west=Math.floor(w/step)*step-step/2,east=Math.ceil(e/step)*step+step/2;
  const south=Math.max(-85,Math.floor(s/step)*step-step/2),north=Math.min(85,Math.ceil(n/step)*step+step/2);
  if((east-west)*(north-south)>100)return '';
  return [wrapLon(west),south,wrapLon(east),north].join(',');
}

export function aisBoxes([w,s,e,n]){
  return (w<=e?[[w,s,e,n]]:[[w,s,180,n],[-180,s,e,n]]).map(([west,south,east,north])=>[south,west,north,east].join(','));
}

const base='https://wmts.marine.copernicus.eu/teroWmts/';
const layer='GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i_202406/sea_water_velocity';
export const forecastTime=(now=Date.now())=>new Date(Math.floor(now/21600000)*21600000).toISOString();
export function sampleWindow([w,s,e,n]){
  const dx=Math.max(1/12,2**Math.ceil(Math.log2(Math.min(360,e-w)/5)));
  const dy=Math.max(1/12,2**Math.ceil(Math.log2((n-s)/4)));
  const start=w+Math.max(0,(e-w-360)/2);
  const west=Math.ceil(start/dx)*dx,south=Math.ceil(s/dy)*dy;
  const east=Math.min(west+360-dx,Math.floor((start+Math.min(360,e-w))/dx)*dx);
  return [west,south,east,Math.floor(n/dy)*dy,dx,dy].join(',');
}
function parameters(time){
  return new URLSearchParams({service:'WMTS',version:'1.0.0',layer,tilematrixset:'EPSG:3857',time});
}
export function forecastTiles(time){
  const p=parameters(time);
  p.set('request','GetTile');p.set('STYLE','vectorStyle:solidAndVector,cmap:haline,range:0/1.5');
  return base+'?'+p+'&tilematrix={z}&tilerow={y}&tilecol={x}';
}
export function pointQuery(lat,lon,time){
  const n=256*1024;
  const x=Math.floor((wrapLon(lon)+180)/360*n);
  const phi=Math.max(-85,Math.min(85,lat))*Math.PI/180;
  const y=Math.floor((1-Math.asinh(Math.tan(phi))/Math.PI)/2*n);
  const p=parameters(time);
  for(const [k,v] of Object.entries({request:'GetFeatureInfo',tilematrix:10,tilerow:Math.floor(y/256),tilecol:Math.floor(x/256),i:x%256,j:y%256,infoformat:'application/json'}))p.set(k,v);
  return base+'?'+p;
}
export function modelVector(response){
  const p=response?.features?.[0]?.properties;
  if(!p || p.component1VariableId!=='uo' || p.component2VariableId!=='vo' || p.component1Units!=='m s-1' || p.component2Units!=='m s-1')return null;
  const u=p.component1Value,v=p.component2Value;
  if(![u,v,p.lat,p.lon].every(Number.isFinite))return null;
  return {lat:p.lat,lon:p.lon,knots:Math.hypot(u,v)*1.943844,bearing:u===0&&v===0?null:(Math.atan2(u,v)*180/Math.PI+360)%360};
}

const vectorCache=new Map();
export async function fetchVector(lat,lon,time,signal){
  const url=pointQuery(lat,lon,time);
  if(vectorCache.has(url))return vectorCache.get(url);
  const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});
  if(!response.ok)throw Error('Forecast lookup unavailable');
  const value=modelVector(await response.json());
  if(vectorCache.size>=256)vectorCache.delete(vectorCache.keys().next().value);
  vectorCache.set(url,value);return value;
}

export async function sampleForecast(key,time,signal){
  const [west,south,east,north,dx,dy]=key.split(',').map(Number),positions=[];
  for(let lat=south;lat<=north+.00001;lat+=dy){
    for(let lon=west;lon<=east+.00001;lon+=dx)positions.push([lat,lon]);
  }
  const vectors=[];
  for(let i=0;i<positions.length;i+=3){
    signal.throwIfAborted();
    const group=await Promise.all(positions.slice(i,i+3).map(([lat,lon])=>fetchVector(lat,lon,time,signal)));
    vectors.push(...group.filter(Boolean));
  }
  return {time,vectors,forecast:true};
}
