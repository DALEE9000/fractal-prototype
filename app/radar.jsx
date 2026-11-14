'use client';
import { useEffect,useState } from 'react';
export default function Radar({portId}){
  const [value,setValue]=useState(null),[loading,setLoading]=useState(true);
  useEffect(()=>{
    const ctrl=new AbortController();
    setLoading(true);setValue(null);
    fetch('/api/radar/'+portId,{signal:ctrl.signal}).then(async r=>{if(r.ok)setValue((await r.json()).current);}).catch(()=>{}).finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    return ()=>ctrl.abort();
  },[portId]);
  const age=value && Date.now()-Date.parse(value.time);
  return <div className="radar"><div><h3>Offshore surface current</h3><p>HF radar · 6 km grid near the offshore buoy</p></div><div>
    <strong>{value?value.value.toFixed(2)+' kt'+(value.towards===null?'':' toward '+value.towards+'° true'):loading?'Loading…':'Unavailable'}</strong>
    {value&&<p>{age>2*3600000?'Older reading · ':''}{value.time.replace('T',' ').replace(':00Z',' UTC')} · {value.latitude}°, {value.longitude}°</p>}
    <a href="https://hfradar.ioos.us/hfrnet/">NOAA HF radar ↗</a></div></div>;
}
