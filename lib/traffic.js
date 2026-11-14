export const harbors = {
  'new-york': { bounds:[-74.19,40.595,-73.875,40.79], provider:'NYC Ferry', link:'https://www.ferry.nyc/developer-tools/' },
  boston: { bounds:[-71.10,42.27,-70.89,42.40], provider:'MBTA', link:'https://api-v3.mbta.com/' },
  'san-francisco': { bounds:[-122.57,37.715,-122.255,37.91] }
};

export function visibleReports(reports, bounds, now=Date.now()) {
  const [west,south,east,north]=bounds;
  return reports.filter(v=>Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)&&v.latitude>=south&&v.latitude<=north&&v.longitude>=west&&v.longitude<=east&&now-v.time>=-60000&&now-v.time<15*60000);
}

export function interpolate(points, seconds) {
  const index=points.findIndex(p=>p[0]>=seconds);
  if(index<0)return null;
  const b=points[index],a=points[Math.max(0,index-1)];
  if(seconds<a[0] || b[0]-a[0]>300)return null;
  const t=b[0]===a[0]?0:(seconds-a[0])/(b[0]-a[0]);
  return {longitude:a[1]+(b[1]-a[1])*t,latitude:a[2]+(b[2]-a[2])*t,bearing:a[3]};
}
