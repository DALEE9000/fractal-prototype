import { NetCDFReader } from 'netcdfjs';
import { charts } from './chart-areas.js';

export function unpackCurrents(bytes, now=Date.now()) {
  const nc=new NetCDFReader(bytes);
  const latitudes=nc.getDataVariable('lat'), longitudes=nc.getDataVariable('lon'), hours=nc.getDataVariable('time');
  const components=['u','v'].map(key=>{
    const variable=nc.variables.find(v=>v.name===key);
    const attrs=Object.fromEntries(variable.attributes.map(a=>[a.name,a.value]));
    if(attrs.units!=='m s-1')throw Error('Unexpected radar velocity unit');
    return {values:nc.getDataVariable(key).flat(),scale:attrs.scale_factor??1,offset:attrs.add_offset??0,fill:attrs._FillValue};
  });
  const width=longitudes.length, cells=width*latitudes.length;
  for(let h=hours.length-1;h>=0;h--){
    const timestamp=hours[h]*1000;
    if(timestamp>now || now-timestamp>12*3600000)continue;
    const vectors=[];
    for(let cell=0;cell<cells;cell++){
      const [u,v]=components.map(c=>{
        const raw=c.values[h*cells+cell];
        return raw===c.fill?NaN:raw*c.scale+c.offset;
      });
      if(!Number.isFinite(u)||!Number.isFinite(v)||Math.abs(u)>10||Math.abs(v)>10)continue;
      vectors.push({lat:latitudes[Math.floor(cell/width)],lon:longitudes[cell%width],knots:Math.hypot(u,v)*1.94384,bearing:u===0&&v===0?null:(Math.atan2(u,v)*180/Math.PI+360)%360});
    }
    if(vectors.length)return {time:new Date(timestamp).toISOString(),vectors};
  }
  return {time:null,vectors:[]};
}
export async function getRadarField(id) {
  const {region,bounds:[west,south,east,north]}=charts[id];
  const end=Math.floor(Date.now()/3600000)*3600000;
  const query=new URLSearchParams([['var','u'],['var','v'],['west',west],['south',south],['east',east],['north',north],['time_start',new Date(end-11*3600000).toISOString()],['time_end',new Date(end).toISOString()],['accept','netcdf3']]);
  const res=await fetch('https://dods.ndbc.noaa.gov/thredds/ncss/grid/hfradar_'+region+'_6km?'+query,{next:{revalidate:600},signal:AbortSignal.timeout(25000)});
  if(!res.ok)throw Error('NOAA regional subset unavailable');
  return unpackCurrents(await res.arrayBuffer());
}
