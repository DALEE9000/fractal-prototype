const sites = {
  'new-york': ['usegc',40.368,-73.701],
  boston: ['usegc',42.346,-70.651],
  'san-francisco': ['uswc',37.75,-122.838]
};

export function radarCurrent(csv, now = Date.now()) {
  const [header,...rows] = csv.trim().split(/\r?\n/);
  if (!header?.includes('u[unit="m s-1"]') || !header.includes('v[unit="m s-1"]')) return null;
  for (const row of rows.reverse()) {
    const [time,,lat,lon,east,north] = row.split(',');
    if (![lat,lon,east,north].every(x => x?.trim() && Number.isFinite(Number(x)))) continue;
    const age=now-Date.parse(time);
    if (!Number.isFinite(age) || age<0 || age>12*3600000) continue;
    const u=Number(east), v=Number(north);
    if (Math.abs(u)>10 || Math.abs(v)>10) continue;
    const knots=Math.hypot(u,v)*1.94384;
    const towards=knots === 0 ? null : Math.round((Math.atan2(u,v)*180/Math.PI+360)%360)%360;
    return {value:knots, time, towards, latitude:Number(lat), longitude:Number(lon)};
  }
  return null;
}

export async function getRadar(port) {
  const [region,latitude,longitude] = sites[port];
  const hour = Math.floor(Date.now()/3600000)*3600000;
  const timeAt = offset => new Date(hour + offset*3600000).toISOString().replace('.000','');
  const search = new URLSearchParams([['var','u'],['var','v'],['latitude',latitude],['longitude',longitude],['time_start',timeAt(-12)],['time_end',timeAt(0)],['accept','csv']]);
  const url='https://dods.ndbc.noaa.gov/thredds/ncss/grid/hfradar_'+region+'_6km?'+search;
  const res=await fetch(url,{signal:AbortSignal.timeout(15000),next:{revalidate:900}});
  if (!res.ok) throw Error('Radar feed unavailable');
  return radarCurrent(await res.text());
}
