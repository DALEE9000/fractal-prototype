'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { harbors, interpolate } from '../lib/traffic.js';

import { mountChart } from './chart-engine.js';
import { charts } from '../lib/chart-areas.js';
import { currentBands } from '../lib/current-scale.js';
import { watchUsAis } from '../lib/us-ais.js';
import { recentAisTrack, rememberReports, trailSegments } from '../lib/vessel-trail.js';

function displayedPosition(track,now,animate) {
  const {report,from,received,duration}=track;
  if(!animate || !duration || now>=received+duration) return report;
  const t=Math.max(0,(now-received)/duration);
  return {...report,latitude:from.latitude+(report.latitude-from.latitude)*t,
    longitude:from.longitude+(report.longitude-from.longitude)*t};
}

export default function TrafficMap({portId,initialReplay=false}) {
  const area=harbors[portId];
  const [mode,setMode]=useState(initialReplay?'replay':area.ais?'live':'us-ais');
  const usAis=mode==='us-ais';
  const [streamStatus,setStreamStatus]=useState('Connecting');
  const [underway,setUnderway]=useState(false);
  const [live,setLive]=useState([]);
  const [recording,setRecording]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [clock,setClock]=useState(60);
  const [playing,setPlaying]=useState(false);
  const [motion,setMotion]=useState(false);
  const [selected,setSelected]=useState('');
  const [following,setFollowing]=useState(false);
  const [selectedName,setSelectedName]=useState('');
  const [past,setPast]=useState(null);
  const liveTrails=useRef(new Map());
  const recentTracks=useRef(new Map());
  const [ready,setReady]=useState(false);
  const [zoom,setZoom]=useState(0);
  const [showRadar,setShowRadar]=useState(true);
  const [flowMotion,setFlowMotion]=useState(false);
  const [radar,setRadar]=useState(null);
  const [radarError,setRadarError]=useState(false);
  const [inspect,setInspect]=useState(null);
  const supportsRadar=Boolean(charts[portId].region);
  const target=useRef(null);
  const display=useRef(null);
  const frame=useRef(60);
  const data=useRef({});
  const lastLive=useRef(new Map());
  const reduced=useRef(false);
  function selectShip(ship){
    setSelected(ship?.id || '');setSelectedName(ship?.name || ship?.id || '');
    setFollowing(Boolean(ship));setInspect(null);
  }
  useEffect(()=>{
    const pref=matchMedia('(prefers-reduced-motion: reduce)');
    const apply=()=>{reduced.current=pref.matches;setMotion(!pref.matches);setFlowMotion(!pref.matches);if(pref.matches)setPlaying(false);};
    apply();pref.addEventListener('change',apply);return ()=>pref.removeEventListener('change',apply);
  },[]);
  useEffect(()=>{
    const ctrl=new AbortController();
    let timer;
    setError('');setLoading(true);setSelected('');setLive([]);setRecording(null);setPlaying(false);
    lastLive.current=new Map();liveTrails.current.clear();setFollowing(false);
    function receive(vessels) {
      rememberReports(liveTrails.current,vessels);
      const received=performance.now(),previous=lastLive.current;
      lastLive.current=new Map(vessels.map(report=>{
        const prior=previous.get(report.id);
        if(prior && prior.report.time===report.time)return [report.id,{...prior,report}];
        const interval=prior ? report.time-prior.report.time : 0;
        const duration=interval>0 && interval<180000 ? Math.min(12000,interval) : 0;
        const from=duration ? displayedPosition(prior,received,data.current.motion) : report;
        return [report.id,{report,from,received,duration}];
      }));
      setLive(vessels);
    }
    if(mode==='us-ais'){
      setStreamStatus('Connecting');
      return watchUsAis(charts[portId].bounds,(vessels,status)=>{
        receive(vessels);setStreamStatus(status);setLoading(false);
      });
    }
    async function update(){
      try{
        const url=mode==='live'?'/api/traffic/'+portId:'/traffic/'+portId+'.json';
        const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw Error();
        const body=await r.json(); if(ctrl.signal.aborted)return;
        if(mode==='live'){
          receive(body.vessels);
        }else{
          setRecording(body); frame.current=body.playbackRate?1:60;setClock(frame.current);setPlaying(!reduced.current);
        }
        setError('');
      }catch{if(!ctrl.signal.aborted){setError('Traffic feed unavailable.');setLive([]);lastLive.current=new Map();}}
      finally{
        if(!ctrl.signal.aborted){setLoading(false);if(mode==='live')timer=setTimeout(update,30000);}
      }
    }
    update();return ()=>{ctrl.abort();clearTimeout(timer);};
  },[mode,portId]);
  useEffect(()=>{
    const lifetime=new AbortController();
    mountChart(target.current,portId,setZoom,hit=>{
      if(hit.ship){selectShip(hit.ship);}
      else setInspect(hit);
    },lifetime.signal,()=>setFollowing(false)).then(chart=>{
      if(!chart)return;
      if(lifetime.signal.aborted){chart.dispose();return;}
      display.current=chart;setReady(true);
    }).catch(()=>{if(!lifetime.signal.aborted)setError('Map unavailable. Reload to retry.');});
    return ()=>{lifetime.abort();display.current?.dispose();display.current=null;};
  },[portId]);
  useEffect(()=>{
    if(!supportsRadar)return;
    const ctrl=new AbortController();let timer;
    async function load(){
      try{
        const r=await fetch('/api/radar/'+portId+'/field',{signal:ctrl.signal});
        if(!r.ok)throw Error();
        const body=await r.json();
        if(!ctrl.signal.aborted){setRadar(body);setRadarError(false);setInspect(null);}
      }catch{if(!ctrl.signal.aborted)setRadarError(true);}
      finally{if(!ctrl.signal.aborted)timer=setTimeout(load,600000);}
    }
    load();return ()=>{ctrl.abort();clearTimeout(timer);};
  },[portId,supportsRadar]);
  useEffect(()=>{display.current?.setField(radar,showRadar,flowMotion);},[ready,radar,showRadar,flowMotion]);
  useEffect(()=>{display.current?.follow(following?selected:'');},[ready,following,selected]);
  useEffect(()=>{
    if(!usAis || !selected){setPast(null);return;}
    const now=Date.now(),cache=recentTracks.current;
    for(const [id,value] of cache)if(now-value.fetched>300000)cache.delete(id);
    const cached=cache.get(selected);
    if(cached){setPast(cached);return;}
    const ctrl=new AbortController();
    setPast({id:selected,loading:true,points:[]});
    recentAisTrack(selected,now,AbortSignal.any([ctrl.signal,AbortSignal.timeout(12000)]))
      .then(points=>{
        if(ctrl.signal.aborted)return;
        const result={id:selected,points,fetched:now};
        if(cache.size>=24)cache.delete(cache.keys().next().value);
        cache.set(selected,result);setPast(result);
      }).catch(()=>{if(!ctrl.signal.aborted)setPast({id:selected,points:[]});});
    return ()=>ctrl.abort();
  },[selected,usAis]);
  useEffect(()=>{data.current={area,mode,recording,playing,selected,motion,underway};},[area,mode,recording,playing,selected,motion,underway]);
  useEffect(()=>{
    let timer,previous=performance.now(),lastTick=-1,lastKey='';
    function render(){
      const now=performance.now(), dt=Math.min((now-previous)/1000,.2);
      previous=now;
      const {area,mode,recording,playing,selected,motion}=data.current;
      if(!document.hidden && area){
        let ships=[];
        if(mode==='replay' && recording){
          if(playing)frame.current=(frame.current+dt*(recording.playbackRate || 20))%recording.duration;
          const second=Math.floor(frame.current);
          if(second!==lastTick){setClock(second);lastTick=second;}
          ships=recording.tracks.flatMap(v=>{const point=interpolate(v.points,frame.current);return point?[{id:v.id,name:v.name,...point}]:[];});
        }else{
          ships=Array.from(lastLive.current.values()).filter(({report})=>mode!=='us-ais'||!data.current.underway||report.speed>=1).map(track=>displayedPosition(track,now,motion));
        }
        const key=ships.map(v=>[v.id,v.longitude,v.latitude,v.bearing].join(',')).join('|')+selected;
        if(display.current && key!==lastKey){display.current.draw(ships,area.bounds,selected);lastKey=key;}
      }
      const blending=data.current.mode!=='replay' && data.current.motion && Array.from(lastLive.current.values()).some(v=>now-v.received<v.duration);
      timer=setTimeout(render,document.hidden?1000:(data.current.playing||blending)?40:300);
    }
    render();return ()=>clearTimeout(timer);
  },[]);
  const replay=mode==='replay';
  const replayNote=area.ais
    ? 'Recorded AIS · November 14, 2026 · 16:48–16:50 UTC'
    : 'Recorded AIS · November 14, 2024 · 16:00–16:30 UTC';
  const listed=replay?(recording?.tracks??[]).flatMap(v=>{const p=interpolate(v.points,clock);return p?[{...p,id:v.id,name:v.name,time:Date.parse(recording.start)+clock*1000}]:[];}):usAis&&underway?live.filter(v=>v.speed>=1):live;
  const choice=listed.find(v=>v.id===selected);
  const segments=useMemo(()=>{
    if(!selected)return [];
    if(replay){
      const points=recording?.tracks.find(v=>v.id===selected)?.points || [];
      return trailSegments(points.map(([seconds,longitude,latitude])=>({time:seconds*1000,longitude,latitude})),clock*1000);
    }
    const base=usAis && past?.id===selected?past.points:[];
    const observed=liveTrails.current.get(selected)||[];
    const now=Date.now();
    return trailSegments([...base,...observed],Math.min(now,observed.at(-1)?.time??now),now-3600000);
  },[selected,replay,recording,clock,usAis,past,live]);
  useEffect(()=>{display.current?.setTrail(segments);},[ready,segments]);
  const fixCount=segments.reduce((sum,s)=>sum+s.length,0);
  function time(value){return new Date(value).toISOString().slice(11,19)+' UTC';}
  const trailStart=segments[0]?.[0]?.time;
  const utcOffset=replay&&recording?Date.parse(recording.start):0;
  return <section className="traffic" aria-label="Harbor traffic">
    <div className="section-head"><h3>Traffic chart</h3><div className="tabs small-tabs">{supportsRadar&&<button aria-pressed={usAis} onClick={()=>setMode('us-ais')}>Live AIS</button>}{area.provider&&<button aria-pressed={mode==='live'} onClick={()=>setMode('live')}>{area.ais?'Live AIS':'Live ferries'}</button>}<button aria-pressed={replay} onClick={()=>setMode('replay')}>{area.ais?'Recorded passage':'AIS replay'}</button></div></div>
    <p className="traffic-note">{replay?replayNote:usAis?'Open Waters AIS · '+streamStatus+' · '+live.length+' vessels reported in the last 15 min':area.provider+' vessel reports · updates every 30 seconds'}{!selected&&' · Click a ship to follow its track.'}</p>
    <div className="instrument">
      <div className="map-controls">
        <div className="layer-controls">{supportsRadar && <button aria-pressed={showRadar} onClick={()=>{setShowRadar(!showRadar);setInspect(null);}}><i className="cyan-dot"/> HF radar</button>}{supportsRadar&&showRadar&&<button aria-pressed={flowMotion} onClick={()=>setFlowMotion(!flowMotion)}>Animate currents</button>}{usAis&&<button aria-pressed={underway} title="Show vessels reporting at least 1 knot" onClick={()=>setUnderway(!underway)}>Moving ships</button>}<button onClick={()=>display.current?.fit('harbor')} disabled={!ready}>Harbor</button>{supportsRadar&&<button onClick={()=>{setShowRadar(true);display.current?.fit('coast');}} disabled={!ready}>Offshore</button>}</div>
        <div className="zoom-controls"><button aria-label="Zoom out" disabled={!ready} onClick={()=>display.current?.zoom(-1)}>−</button><output aria-label="Map zoom">{zoom?zoom.toFixed(1):'…'}</output><button aria-label="Zoom in" disabled={!ready} onClick={()=>display.current?.zoom(1)}>+</button></div>
      </div>
      <div className="radar-map" ref={target} aria-label="Interactive harbor chart. Select a ship to follow it. Use plus and minus to zoom, and arrow keys to pan."/>
      {selected&&<div className="follow-bar"><div><strong>{following?'Following':'Selected'} {choice?.name||selectedName}</strong>
        <span>{!choice?'Waiting for a vessel report':fixCount>1?fixCount+' reported positions · since '+time(utcOffset+trailStart):past?.id===selected&&past.loading?'Loading recent track…':'Trail grows with new reports'}</span></div>
        <button onClick={()=>setFollowing(!following)}>{following?'Stop following':'Resume follow'}</button>
        <button aria-label="Clear selected vessel and trail" onClick={()=>selectShip(null)}>✕</button></div>}
      <div className="map-legend"><span><i className="ship-dot"/>{replay?'Recorded vessels':usAis&&underway?'Ships ≥1 kt':usAis||area.ais?'AIS vessels':'Live ferries'}</span>
      {supportsRadar&&showRadar&&<div className="current-scale" aria-label="Surface current speed in knots"><strong>↗ Current (kt)</strong>{currentBands.map(b=><span key={b.label}><i style={{background:b.color}}/>{b.label}</span>)}</div>}
      {selected&&<span><i className="trail-line"/> Reported track</span>}
      <span className="map-credit"><a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OSM</a></span></div>
    </div>
    {usAis&&<div className="ais-credit"><a href="https://openwaters.io/ais/">Open Waters AIS</a> · <a href="https://www.aishub.net/">Data: AISHub contributors</a> · <a href="https://openwaters.io/ais/#license">Receiver credits &amp; licenses</a></div>}
    {supportsRadar&&showRadar&&<p className="field-status" role="status">{radar?.time?'Latest NOAA HFR · '+radar.time.slice(0,16).replace('T',' ')+' UTC · '+radar.vectors.length+' grid cells'+(radarError?' · update delayed':'') :radarError?'NOAA radar temporarily unavailable.':radar?'No recent radar vectors in this area.':'Loading NOAA radar grid…'}{radar?.time&&(replay?' · Current observations overlay archived traffic.':' · Select an arrow to inspect.')}</p>}
    {inspect&&showRadar&&<p className="field-pick">{inspect.vector.knots.toFixed(2)} kt {inspect.vector.bearing===null?'· calm':'toward '+Math.round(inspect.vector.bearing)%360+'° true'} · {inspect.vector.lat.toFixed(3)}°, {inspect.vector.lon.toFixed(3)}°</p>}
    {replay && recording && <div className="replay-controls"><button onClick={()=>setPlaying(!playing)}>{playing?'Pause':'Play'} replay</button><label>Replay time <input aria-label="Replay time" type="range" min="0" max={recording.duration} value={clock} onChange={e=>{frame.current=Number(e.target.value);setPlaying(false);setClock(frame.current);}}/></label><time>{time(Date.parse(recording.start)+clock*1000)}</time><span>{recording.playbackRate||20}×</span></div>}
    {!replay && <button className="link" aria-pressed={motion} onClick={()=>setMotion(!motion)}>{motion?'Pause':'Enable'} position animation</button>}
    {loading?<p>Loading vessel reports…</p>:error?<p role="status">{error}</p>:listed.length===0?<p>{usAis&&underway?'No vessels currently reporting 1 kt or faster.':'No recent vessel reports in this harbor.'}</p>:<div className="ship-picker"><label>Inspect vessel <select value={choice?.id??''} onChange={e=>selectShip(listed.find(v=>v.id===e.target.value))}><option value="">Choose from {listed.length} vessels</option>{listed.map(v=><option key={v.id} value={v.id}>{v.name}{v.kind?' · '+v.kind:''}</option>)}</select></label>{choice&&<p>{choice.name}{choice.kind&&' · '+choice.kind}{Number.isFinite(choice.speed)&&' · '+choice.speed.toFixed(1)+' kt'} · {choice.latitude.toFixed(4)}°, {choice.longitude.toFixed(4)}° · {replay?'Replay time':'Reported'} {time(choice.time)}{usAis&&' · '+(choice.source==='aishub'?'AISHub':'Volunteer receiver')}</p>}</div>}
    <div className="sources">{replay&&!area.ais?<a href="https://github.com/NOAA-OCM/ocm-marinecadastre-ais-vessel-traffic">NOAA Marine Cadastre AIS archive ↗</a>:!usAis&&<a href={area.link}>{area.provider} position feed ↗</a>}{area.ais?<a href="https://creativecommons.org/licenses/by/4.0/">AIS data · CC BY 4.0</a>:<a href="/traffic/helsinki">Open live AIS · Helsinki →</a>}</div>
  </section>;
}
