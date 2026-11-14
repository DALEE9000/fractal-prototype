'use client';
import { useEffect, useRef, useState } from 'react';
import { harbors, interpolate } from '../lib/traffic.js';

import { mountChart } from './chart-engine.js';
import { charts } from '../lib/chart-areas.js';

export default function TrafficMap({portId,initialReplay=false}) {
  const area=harbors[portId];
  const [mode,setMode]=useState(area.provider&&!initialReplay?'live':'replay');
  const [live,setLive]=useState([]);
  const [recording,setRecording]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [clock,setClock]=useState(60);
  const [playing,setPlaying]=useState(false);
  const [motion,setMotion]=useState(false);
  const [selected,setSelected]=useState('');
  const [ready,setReady]=useState(false);
  const [zoom,setZoom]=useState(0);
  const [showRadar,setShowRadar]=useState(true);
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
  useEffect(()=>{
    const pref=matchMedia('(prefers-reduced-motion: reduce)');
    const apply=()=>{reduced.current=pref.matches;setMotion(!pref.matches);if(pref.matches)setPlaying(false);};
    apply();pref.addEventListener('change',apply);return ()=>pref.removeEventListener('change',apply);
  },[]);
  useEffect(()=>{
    const ctrl=new AbortController();
    let timer;
    setError('');setLoading(true);setSelected('');
    lastLive.current=new Map();
    async function update(){
      try{
        const url=mode==='live'?'/api/traffic/'+portId:'/traffic/'+portId+'.json';
        const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw Error();
        const body=await r.json(); if(ctrl.signal.aborted)return;
        if(mode==='live'){
          const received=performance.now();
          const previous=lastLive.current;
          lastLive.current=new Map(body.vessels.map(v=>{
            const old=previous.get(v.id)?.report;
            return [v.id,{report:v,from:old&&v.time>old.time&&v.time-old.time<180000?old:v,received}];
          }));
          setLive(body.vessels);
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
      if(hit.ship){setSelected(hit.ship.id);setInspect(null);}
      else setInspect(hit);
    },lifetime.signal).then(chart=>{
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
  useEffect(()=>{display.current?.setField(radar,showRadar);},[ready,radar,showRadar]);
  useEffect(()=>{data.current={area,mode,recording,playing,selected,motion};},[area,mode,recording,playing,selected,motion]);
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
          ships=recording.tracks.flatMap(v=>{const point=interpolate(v.points,frame.current);return point?[{id:v.id,...point}]:[];});
        }else if(mode==='live'){
          ships=Array.from(lastLive.current.values()).map(({report,from,received})=>{
            const t=motion?Math.min(1,(now-received)/1500):1;
            return {...report,latitude:from.latitude+(report.latitude-from.latitude)*t,longitude:from.longitude+(report.longitude-from.longitude)*t};
          });
        }
        const key=ships.map(v=>[v.id,v.longitude,v.latitude,v.bearing].join(',')).join('|')+selected;
        if(display.current && key!==lastKey){display.current.draw(ships,area.bounds,selected);lastKey=key;}
      }
      const blending=data.current.mode==='live' && data.current.motion && Array.from(lastLive.current.values()).some(v=>v.from!==v.report && now-v.received<1600);
      timer=setTimeout(render,document.hidden?1000:(data.current.playing||blending)?40:300);
    }
    render();return ()=>clearTimeout(timer);
  },[]);
  const replay=mode==='replay';
  const replayNote=area.ais
    ? 'Recorded AIS · November 14, 2026 · 16:48–16:50 UTC'
    : 'Recorded AIS · November 14, 2024 · 16:00–16:30 UTC';
  const listed=replay?(recording?.tracks??[]).flatMap(v=>{const p=interpolate(v.points,clock);return p?[{...p,id:v.id,name:v.name,time:Date.parse(recording.start)+clock*1000}]:[];}):live;
  const choice=listed.find(v=>v.id===selected);
  function time(value){return new Date(value).toISOString().slice(11,19)+' UTC';}
  return <section className="traffic" aria-label="Harbor traffic">
    <div className="section-head"><h3>Traffic chart</h3><div className="tabs small-tabs">{area.provider&&<button aria-pressed={!replay} onClick={()=>setMode('live')}>{area.ais?'Live AIS':'Live ferries'}</button>}<button aria-pressed={replay} onClick={()=>setMode('replay')}>{area.ais?'Recorded passage':'AIS replay'}</button></div></div>
    <p className="traffic-note">{replay?replayNote:area.provider+' vessel reports · updates every 30 seconds'}</p>
    <div className="instrument">
      <div className="map-controls">
        <div className="layer-controls">{supportsRadar && <button aria-pressed={showRadar} onClick={()=>{setShowRadar(!showRadar);setInspect(null);}}><i className="cyan-dot"/> HF radar</button>}<button onClick={()=>display.current?.fit('harbor')} disabled={!ready}>Harbor</button>{supportsRadar&&<button onClick={()=>{setShowRadar(true);display.current?.fit('coast');}} disabled={!ready}>Offshore</button>}</div>
        <div className="zoom-controls"><button aria-label="Zoom out" disabled={!ready} onClick={()=>display.current?.zoom(-1)}>−</button><output aria-label="Map zoom">{zoom?zoom.toFixed(1):'…'}</output><button aria-label="Zoom in" disabled={!ready} onClick={()=>display.current?.zoom(1)}>+</button></div>
      </div>
      <div className="radar-map" ref={target} aria-label="Interactive harbor chart. Use plus and minus to zoom, and arrow keys to pan."/>
      <div className="map-legend"><span><i className="ship-dot"/>{replay?'Recorded vessels':area.ais?'AIS vessels':'Live ferries'}</span>
      {supportsRadar&&showRadar&&<span><b>↗</b> Surface current · toward flow</span>}
      <span className="map-credit"><a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OSM</a></span></div>
    </div>
    {supportsRadar&&showRadar&&<p className="field-status" role="status">{radar?.time?'Latest NOAA HFR · '+radar.time.slice(0,16).replace('T',' ')+' UTC · '+radar.vectors.length+' grid cells'+(radarError?' · update delayed':'') :radarError?'NOAA radar temporarily unavailable.':radar?'No recent radar vectors in this area.':'Loading NOAA radar grid…'}{radar?.time&&(replay?' · Current observations overlay archived traffic.':' · Select an arrow to inspect.')}</p>}
    {inspect&&showRadar&&<p className="field-pick">{inspect.vector.knots.toFixed(2)} kt {inspect.vector.bearing===null?'· calm':'toward '+Math.round(inspect.vector.bearing)%360+'° true'} · {inspect.vector.lat.toFixed(3)}°, {inspect.vector.lon.toFixed(3)}°</p>}
    {replay && recording && <div className="replay-controls"><button onClick={()=>setPlaying(!playing)}>{playing?'Pause':'Play'} replay</button><label>Replay time <input aria-label="Replay time" type="range" min="0" max={recording.duration} value={clock} onChange={e=>{frame.current=Number(e.target.value);setPlaying(false);setClock(frame.current);}}/></label><time>{time(Date.parse(recording.start)+clock*1000)}</time><span>{recording.playbackRate||20}×</span></div>}
    {!replay && <button className="link" aria-pressed={motion} onClick={()=>setMotion(!motion)}>{motion?'Pause':'Enable'} position animation</button>}
    {loading?<p>Loading vessel reports…</p>:error?<p role="status">{error}</p>:listed.length===0?<p>No reports in this harbor at this time.</p>:<div className="ship-picker"><label>Inspect vessel <select value={choice?.id??''} onChange={e=>setSelected(e.target.value)}><option value="">Choose from {listed.length} vessels</option>{listed.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>{choice&&<p>{choice.name} · {choice.latitude.toFixed(4)}°, {choice.longitude.toFixed(4)}° · {replay?'Replay time':'Reported'} {time(choice.time)}</p>}</div>}
    <div className="sources">{replay&&!area.ais?<a href="https://github.com/NOAA-OCM/ocm-marinecadastre-ais-vessel-traffic">NOAA Marine Cadastre AIS archive ↗</a>:<a href={area.link}>{area.provider} position feed ↗</a>}{area.ais?<a href="https://creativecommons.org/licenses/by/4.0/">AIS data · CC BY 4.0</a>:<a href="/traffic/helsinki">Open live AIS · Helsinki →</a>}</div>
  </section>;
}
