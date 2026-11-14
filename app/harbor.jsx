'use client';
import { useEffect, useState } from 'react';
import { ports, findPort } from '../lib/ports.js';
import AuthPanel, { authClient } from './auth-panel.jsx';
import TrafficMap from './traffic-map.jsx';
import Radar from './radar.jsx';

const coordinates = {
  'new-york': [[40.701,-74.014],[40.368,-73.701],[-74.37,40.24,-73.53,40.76]],
  boston: [[42.355,-71.050],[42.346,-70.651],[-71.22,42.10,-70.38,42.62]],
  'san-francisco': [[37.806,-122.466],[37.75,-122.838],[-123.09,37.51,-122.25,38.03]]
};
function Chart({port}) {
  const [station, buoy, [west,south,east,north]] = coordinates[port.id];
  return <figure className="chart"><div className="map">
    <img src={'/charts/'+port.id+'.jpg'} alt={'Ocean basemap around '+port.name} width="840" height="520"/>
    {[station,buoy].map(([lat,lon],i)=><span key={i} className={'pin '+(i?'sea':'land')} style={{left:(lon-west)/(east-west)*100+'%',top:(north-lat)/(north-south)*100+'%'}}><i/>{i?'Buoy '+port.buoy:port.harbor}</span>)}
  </div><figcaption><span>Station locator</span><small>Esri, Garmin, GEBCO, NOAA NGDC and contributors</small></figcaption></figure>;
}
function Reading({label,unit,reading,loading}) {
  const date = reading && new Date(reading.time);
  const stale = date && Date.now()-date.getTime()>2*3600000;
  return <div className="reading"><span className="reading-label">{label}</span>
    <strong>{reading ? reading.value.toFixed(1) : '—'} {reading && <small>{unit}</small>}</strong>
    <span className={stale?'old':'timestamp'}>{date ? (stale?'Older reading · ':'') + date.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC',hour12:false}) + ' UTC' : loading?'Loading…':'Unavailable'}</span>
  </div>;
}
export default function Harbor(){
  const [portId, setPortId] = useState(ports[0].id);
  const [query, setQuery] = useState('');
  const [conditions,setConditions] = useState(null);
  const [loading,setLoading] = useState(true);
  const [refresh,setRefresh] = useState(0);
  const [saved,setSaved] = useState([]);
  const [savedReady,setSavedReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [modal,setModal] = useState(false);
  const [onlySaved,setOnlySaved] = useState(false);
  const [notice,setNotice] = useState('');
  const [chartView,setChartView] = useState('traffic');
  const {data:session,isPending,refetch} = authClient.useSession();
  const port=findPort(portId);
  useEffect(()=>{
    const sync=()=>{const id=new URLSearchParams(location.search).get('port');setPortId(findPort(id)?.id || ports[0].id);};
    sync(); window.addEventListener('popstate',sync);return ()=>window.removeEventListener('popstate',sync);
  },[]);
  useEffect(()=>{
    const ctrl=new AbortController();
    setConditions(null);setLoading(true);
    fetch('/api/ports/'+portId,{signal:ctrl.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(setConditions)
      .catch(()=>{}).finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    return ()=>ctrl.abort();
  },[portId,refresh]);
  useEffect(()=>{
    const ctrl=new AbortController();
    setSaved([]);setSavedReady(false);setOnlySaved(false);
    if(session?.user) fetch('/api/saved',{signal:ctrl.signal}).then(r=>{if(!r.ok)throw Error();return r.json();})
      .then(ids=>{if(!ctrl.signal.aborted){setSaved(ids);setSavedReady(true);}}).catch(()=>{if(!ctrl.signal.aborted)setNotice('Could not load saved ports. Refresh to retry.');});
    return ()=>ctrl.abort();
  },[session?.user?.id]);
  function choose(id){setPortId(id);setNotice('');history.pushState({},'', '?port='+id);}
  async function toggleSaved(){
    if(!session?.user){setModal(true);return;}
    setBusy(true);setNotice('');
    const removing=saved.includes(portId);
    try{
      const r=await fetch('/api/saved',{method:removing?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({port:portId})});
      if(!r.ok)throw Error();
      setSaved(ids=>removing?ids.filter(id=>id!==portId):Array.from(new Set([...ids,portId])));
      setNotice(removing?'Port removed from your watchlist.':'Port added to your watchlist.');
    }catch{setNotice('Could not update your watchlist. Please try again.');}finally{setBusy(false);}
  }
  async function logout(){try{const r=await authClient.signOut();if(r.error)throw Error();await refetch();setNotice('Signed out.');}catch{setNotice('Could not sign out. Try again.');}}
  const visible=ports.filter(p=>(!onlySaved||saved.includes(p.id)) && (p.name+' '+p.region).toLowerCase().includes(query.toLowerCase().trim()));
  return <>
    <header><div className="mast"><a className="brand" href="/"><span className="mark" aria-hidden="true">≋</span>Harbor Ledger</a>
    <div className="header-actions"><a href="/traffic/helsinki">Live AIS</a><button className="account" disabled={isPending} onClick={session?.user?logout:()=>setModal(true)}>{session?.user?'Sign out':'Sign in'}</button></div></div></header>
    <main><div className="intro"><div><p className="overline">Port directory</p><h1>Coastal conditions</h1></div><p className="intro-note">Harbor water levels and offshore observations<br/>from NOAA tide stations and ocean buoys.</p></div>
    <div className="desk"><aside aria-label="Port directory"><label htmlFor="search">Find a port</label><input id="search" type="search" placeholder="Search ports or states" value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="tabs"><button aria-pressed={!onlySaved} onClick={()=>setOnlySaved(false)}>All ports</button><button aria-pressed={onlySaved} onClick={()=>session?.user?setOnlySaved(true):setModal(true)}>Saved{session?.user?' ('+saved.length+')':''}</button></div>
    <nav aria-label="Matching ports">{visible.map(p=><button key={p.id} aria-current={p.id===portId?'true':undefined} onClick={()=>choose(p.id)}><strong>{p.name}</strong><span>{p.region}</span></button>)}</nav>
    {!visible.length&&<p className="empty">{onlySaved&&!query?'Your saved ports will appear here.':'No matching ports.'}</p>}</aside>
    <article><div className="port-title"><div><p className="overline">{port.region}</p><h2>{port.name}</h2><p className="coords">{port.coordinates}</p></div><button disabled={isPending||busy||(!!session?.user&&!savedReady)} className="save" onClick={toggleSaved}>{saved.includes(portId)?'✓ Saved':'＋ Save port'}</button></div>
    <p className="notice" role="status">{notice}</p>
    <section aria-label="Station readings" className="observations">
    <div className="section-head"><h3>Station readings</h3><button className="link" onClick={()=>setRefresh(r=>r+1)} disabled={loading}>Refresh</button></div>
    <div className="metrics"><Reading label="Harbor water level" reading={conditions?.water} unit="ft MLLW" loading={loading}/><Reading label="Offshore wave height" reading={conditions?.wave} unit="ft" loading={loading}/><Reading label="Peak wave period" reading={conditions?.period} unit="s" loading={loading}/><Reading label="Offshore wind" reading={conditions?.wind} unit="kt" loading={loading}/></div></section>
    <Radar key={portId+'-radar'} portId={portId}/>
    <div className="sources"><a href={'https://tidesandcurrents.noaa.gov/stationhome.html?id='+port.tide}>Tide station {port.tide} ↗</a><a href={'https://www.ndbc.noaa.gov/station_page.php?station='+port.buoy}>Offshore buoy {port.buoy} ↗</a></div>
    <div className="tabs map-tabs" aria-label="Map view"><button aria-pressed={chartView==='traffic'} onClick={()=>setChartView('traffic')}>Traffic map</button><button aria-pressed={chartView==='stations'} onClick={()=>setChartView('stations')}>Observation stations</button></div>
    {chartView==='traffic'?<TrafficMap key={portId} portId={portId}/>:<Chart port={port}/>}
    </article></div></main><footer>Preliminary observations for reference. For navigation, consult official nautical charts and marine forecasts.</footer>
    {modal && <AuthPanel close={()=>setModal(false)} signedIn={async()=>{await refetch();setModal(false);setNotice('Signed in. Choose Save port to add it to your watchlist.');}}/>}
  </>;
}
