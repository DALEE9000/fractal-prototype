'use client';
import { useEffect, useRef, useState } from 'react';
import { harbors, interpolate } from '../lib/traffic.js';

function createFleet(THREE, node) {
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, powerPreference:'low-power' });
  renderer.setClearColor(0,0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.domElement.setAttribute('aria-hidden','true');
  node.appendChild(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(0,840,520,0,.1,200);
  camera.position.z=80;
  const light=new THREE.DirectionalLight(0xffffff,2.7);
  light.position.set(-60,95,90);
  scene.add(light,new THREE.AmbientLight(0xdceeea,1.8));
  const outline=new THREE.Shape();
  outline.moveTo(0,10); outline.lineTo(3.9,3); outline.lineTo(3.2,-7); outline.lineTo(-3.2,-7); outline.lineTo(-3.9,3); outline.closePath();
  const hull=new THREE.ExtrudeGeometry(outline,{depth:2,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.55,bevelThickness:.55});
  const cabin=new THREE.BoxGeometry(3.7,6,2);
  const tint=new THREE.MeshStandardMaterial({color:0x075c5d,roughness:.65});
  const selected=new THREE.MeshStandardMaterial({color:0xc85822});
  const white=new THREE.MeshStandardMaterial({color:0xffefcd});
  const ships=new Map();
  const factory=id=>{
    const group=new THREE.Group();
    const body=new THREE.Mesh(hull,tint);
    const top=new THREE.Mesh(cabin,white);
    top.position.set(0,-1,3.1); group.add(body,top);scene.add(group);
    ships.set(id,group);return group;
  };
  const resize=new ResizeObserver(()=>{renderer.setSize(node.clientWidth,node.clientHeight,false);renderer.render(scene,camera);});
  resize.observe(node);
  return {
    draw(reports,bounds,chosen){
      const [w,s,e,n]=bounds; const ids=new Set();
      for(const ship of reports){
        ids.add(ship.id);
        const marker=ships.get(ship.id) || factory(ship.id);
        marker.position.set((ship.longitude-w)/(e-w)*840,(ship.latitude-s)/(n-s)*520,0);
        marker.rotation.z=-(ship.bearing??0)*Math.PI/180;
        marker.children[0].material=ship.id===chosen?selected:tint;
        marker.visible=true;
      }
      for(const [id,marker] of ships) if(!ids.has(id))marker.visible=false;
      renderer.render(scene,camera);
    },
    dispose(){resize.disconnect();for(const asset of [hull,cabin,tint,white,selected])asset.dispose();renderer.dispose();renderer.domElement.remove();}
  };
}

export default function TrafficMap({portId}) {
  const area=harbors[portId];
  const [mode,setMode]=useState(area.provider?'live':'replay');
  const [live,setLive]=useState([]);
  const [recording,setRecording]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [clock,setClock]=useState(60);
  const [playing,setPlaying]=useState(false);
  const [motion,setMotion]=useState(false);
  const [selected,setSelected]=useState('');
  const [webgl,setWebgl]=useState(false);
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
          setRecording(body); frame.current=60;setClock(60);setPlaying(!reduced.current);
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
    let disposed=false;
    import('three').then(THREE=>{
      if(disposed || !target.current)return;
      try{display.current=createFleet(THREE,target.current);setWebgl(true);}catch{setWebgl(false);}
    }).catch(()=>setWebgl(false));
    return ()=>{disposed=true;display.current?.dispose();display.current=null;};
  },[]);
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
          if(playing)frame.current=(frame.current+dt*20)%recording.duration;
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
  const listed=replay?(recording?.tracks??[]).flatMap(v=>{const p=interpolate(v.points,clock);return p?[{...p,id:v.id,name:v.name,time:Date.parse(recording.start)+clock*1000}]:[];}):live;
  const choice=listed.find(v=>v.id===selected);
  function time(value){return new Date(value).toISOString().slice(11,19)+' UTC';}
  return <section className="traffic" aria-label="Harbor traffic">
    <div className="section-head"><h3>Harbor traffic</h3>{area.ais?<span className="overline">Live AIS</span>:<div className="tabs small-tabs">{area.provider&&<button aria-pressed={!replay} onClick={()=>setMode('live')}>Live ferries</button>}<button aria-pressed={replay} onClick={()=>setMode('replay')}>AIS replay</button></div>}</div>
    <p className="traffic-note">{replay?'Recorded AIS · November 14, 2024 · 16:00–16:30 UTC':area.provider+' vessel reports · updates every 30 seconds'}</p>
    <div className="map traffic-chart"><img src={'/charts/'+portId+'-traffic.jpg'} width="840" height="520" alt={'Harbor traffic basemap for '+portId.replaceAll('-',' ')}/><div className="fleet" ref={target}/>
      {!webgl && listed.map(v=><i key={v.id} className="vessel-dot" style={{left:100*(v.longitude-area.bounds[0])/(area.bounds[2]-area.bounds[0])+'%',top:100*(area.bounds[3]-v.latitude)/(area.bounds[3]-area.bounds[1])+'%'}}/>)}
      <span className="map-key"><i/>{replay?'Recorded track':area.ais?'AIS position':'Ferry position'}</span>
    </div>
    <figcaption><span>Harbor traffic locator</span><small>{area.ais?'Esri, Vantor, Earthstar Geographics and the GIS User Community':'Esri, Garmin, GEBCO, NOAA NGDC and contributors'}</small></figcaption>
    {replay && recording && <div className="replay-controls"><button onClick={()=>setPlaying(!playing)}>{playing?'Pause':'Play'} replay</button><label>Replay time <input aria-label="Replay time" type="range" min="0" max={recording.duration} value={clock} onChange={e=>{frame.current=Number(e.target.value);setPlaying(false);setClock(frame.current);}}/></label><time>{time(Date.parse(recording.start)+clock*1000)}</time><span>20×</span></div>}
    {!replay && <button className="link" aria-pressed={motion} onClick={()=>setMotion(!motion)}>{motion?'Pause':'Enable'} position animation</button>}
    {loading?<p>Loading vessel reports…</p>:error?<p role="status">{error}</p>:listed.length===0?<p>No reports in this harbor at this time.</p>:<div className="ship-picker"><label>Inspect vessel <select value={choice?.id??''} onChange={e=>setSelected(e.target.value)}><option value="">Choose from {listed.length} vessels</option>{listed.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>{choice&&<p>{choice.name} · {choice.latitude.toFixed(4)}°, {choice.longitude.toFixed(4)}° · {replay?'Replay time':'Reported'} {time(choice.time)}</p>}</div>}
    <div className="sources">{replay?<a href="https://github.com/NOAA-OCM/ocm-marinecadastre-ais-vessel-traffic">NOAA Marine Cadastre AIS archive ↗</a>:<a href={area.link}>{area.provider} position feed ↗</a>}{area.ais?<a href="https://creativecommons.org/licenses/by/4.0/">AIS data · CC BY 4.0</a>:<a href="/traffic/helsinki">Open live AIS · Helsinki →</a>}</div>
  </section>;
}
