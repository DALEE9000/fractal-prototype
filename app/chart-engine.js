import { charts,basemapBounds } from '../lib/chart-areas.js';
import { harbors } from '../lib/traffic.js';
import { currentColor } from '../lib/current-scale.js';

function makeShipSprite(THREE) {
  const pattern=[
    '....oo....','...occo...','...occo...','..obbbbo..','..obwwbo..','..obwwbo..','..obbbbo..','..obwwbo..','..obwwbo..','..obbbbo..','..oooooo..'
  ];
  const colors={o:'#081a30',b:'#f4b467',w:'#fff5ce',c:'#ffd48b'};
  const canvas=document.createElement('canvas');canvas.width=10;canvas.height=11;
  const ctx=canvas.getContext('2d');
  pattern.forEach((row,y)=>[...row].forEach((ch,x)=>{if(colors[ch]){ctx.fillStyle=colors[ch];ctx.fillRect(x,y,1,1);}}));
  const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export async function mountChart(node,portId,onZoom,onPick,signal,onManualPan) {
  const [module,THREE]=await Promise.all([import('leaflet'),import('three')]);
  if(signal.aborted)return null;
  const L=module.default??module;
  const chart=charts[portId];
  const bounds=([w,s,e,n])=>L.latLngBounds([s,w],[n,e]);
  const coast=bounds(chart.bounds), harbor=bounds(harbors[portId].bounds);
  const map=L.map(node,{zoomControl:false,attributionControl:false,zoomSnap:0.25,zoomDelta:0.5,minZoom:7,maxZoom:15,zoomAnimation:false,fadeAnimation:false,maxBounds:coast.pad(.08),maxBoundsViscosity:1,keyboard:true});
  map.fitBounds(chart.region?harbor.extend(chart.buoy):harbor,{padding:[14,14]});
  const whole=L.latLngBounds(coast.getSouthWest(),coast.getNorthEast());
  const limit=()=>map.setMinZoom(Math.max(7,map.getBoundsZoom(whole,false)-.25));
  limit();
  L.imageOverlay('/charts/'+portId+'-pixel.png',bounds(basemapBounds(chart.bounds)),{interactive:false,className:'pixel-geography'}).addTo(map);
  const placeLayer=L.layerGroup().addTo(map);
  const label=(text,point,kind)=>L.marker(point,{interactive:false,keyboard:false,icon:L.divIcon({className:'chart-label '+kind,html:text,iconAnchor:[0,0],iconSize:null})}).addTo(placeLayer);
  for(const [text,lat,lon] of chart.labels)label(text,[lat,lon],'place');
  if(chart.station){label('◆ Tide gauge',chart.station,'gauge');label('◆ Buoy',chart.buoy,'buoy');}
  const overlay=document.createElement('div');overlay.className='projected-layer';node.appendChild(overlay);
  const fieldCanvas=document.createElement('canvas');overlay.appendChild(fieldCanvas);
  const ctx=fieldCanvas.getContext('2d');
  const flowCanvas=document.createElement('canvas');overlay.appendChild(flowCanvas);
  const flow=flowCanvas.getContext('2d');
  const trailCanvas=document.createElement('canvas');overlay.appendChild(trailCanvas);
  const trailContext=trailCanvas.getContext('2d');
  let trail=[],followId='',positionedId='';
  let shipCanvas,shipContext;
  let renderer,scene,camera,sprite;
  try{
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});
    renderer.setClearColor(0,0);renderer.setPixelRatio(1);
    overlay.appendChild(renderer.domElement);scene=new THREE.Scene();
    camera=new THREE.OrthographicCamera(0,1,1,0,.1,100);camera.position.z=10;
    sprite=makeShipSprite(THREE);
  }catch{
    renderer=null;shipCanvas=document.createElement('canvas');overlay.appendChild(shipCanvas);
    shipContext=shipCanvas.getContext('2d');
  }
  const ships=new Map();
  let width=1,height=1,reports=[],selection='',field=null,showField=true,hitPoints=[],shipPoints=[];
  const project=(lat,lon)=>map.latLngToContainerPoint([lat,lon]);
  function drawTrail() {
    const ctx=trailContext;
    ctx.clearRect(0,0,width,height);
    ctx.lineJoin='round';ctx.lineCap='round';
    for(const segment of trail){
      ctx.beginPath();
      for(const [i,point] of segment.entries()){
        const {x,y}=project(point.latitude,point.longitude);
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.lineWidth=5;ctx.strokeStyle='#12243c';ctx.stroke();
      ctx.lineWidth=2.5;ctx.strokeStyle='#ffcf85';ctx.stroke();
      for(const point of segment){
        const {x,y}=project(point.latitude,point.longitude);
        ctx.fillStyle='#ffedcf';ctx.fillRect(x-1.5,y-1.5,3,3);
      }
    }
    const selected=reports.find(v=>v.id===selection);
    if(selected){
      const {x,y}=project(selected.latitude,selected.longitude);
      ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);
      ctx.lineWidth=3.5;ctx.strokeStyle='#12243c';ctx.stroke();
      ctx.lineWidth=1.7;ctx.strokeStyle='#fff0bd';ctx.stroke();
    }
  }
  function followShip() {
    const ship=reports.find(v=>v.id===followId);
    if(!ship)return;
    const point=[ship.latitude,ship.longitude],first=positionedId!==followId;
    const offset=map.latLngToContainerPoint(point).distanceTo(map.getSize().divideBy(2));
    if(first || offset>1.5){
      positionedId=followId;
      map.setView(point,first?Math.max(map.getZoom(),11):map.getZoom(),{animate:false});
    }
  }
  let animateFlow=false,flowTimer,viewVisible=true;
  function paintFlow() {
    flow.clearRect(0,0,width,height);
    if (!showField || !animateFlow || !viewVisible || document.hidden || !hitPoints.length) return;
    const seconds=performance.now()/1000;
    for (const cell of hitPoints) {
      if (cell.v.bearing===null || !cell.v.knots) continue;
      const phase=(seconds*Math.min(.25+cell.v.knots*.6,2)+cell.seed)%1;
      const offset=(phase-.5)*cell.travel;
      const x=cell.x+cell.dx*offset,y=cell.y+cell.dy*offset;
      flow.fillStyle=cell.color;flow.globalAlpha=.7;
      flow.fillRect(Math.round(x-cell.dx*3)-1,Math.round(y-cell.dy*3)-1,2,2);
      flow.globalAlpha=1;flow.fillStyle='#f0fbff';flow.fillRect(Math.round(x)-1,Math.round(y)-1,3,3);
    }
    flowTimer=setTimeout(paintFlow,66);
  }
  function restartFlow() {clearTimeout(flowTimer);paintFlow();}
  const drawField=()=>{
    ctx.clearRect(0,0,width,height);
    hitPoints=[];if(!showField||!field){restartFlow();return;}
    for(const v of field.vectors){
      const {x,y}=project(v.lat,v.lon);
      const latRadius=(field.grid?.latStep||0)/2,lonRadius=(field.grid?.lonStep||0)/2;
      const nw=project(v.lat+latRadius,v.lon-lonRadius),se=project(v.lat-latRadius,v.lon+lonRadius);
      if(se.x<0||se.y<0||nw.x>width||nw.y>height)continue;
      const color=currentColor(v.knots),angle=(v.bearing??0)*Math.PI/180;
      const travel=Math.max(9,Math.min(70,(se.x-nw.x)*.75,(se.y-nw.y)*.75));
      hitPoints.push({x,y,v,nw,se,color,travel,dx:Math.sin(angle),dy:-Math.cos(angle),seed:Math.abs(v.lon*31+v.lat*13)%1});
      ctx.fillStyle=color;ctx.globalAlpha=.29;
      ctx.fillRect(nw.x,nw.y,Math.max(0,se.x-nw.x-1),Math.max(0,se.y-nw.y-1));ctx.globalAlpha=1;
      ctx.save();ctx.translate(x,y);ctx.rotate((v.bearing??0)*Math.PI/180);
      const length=7+Math.min(v.knots,2)*7;
      ctx.beginPath();if(v.bearing===null){ctx.arc(0,0,2,0,Math.PI*2);}else{ctx.moveTo(0,length*.35);ctx.lineTo(0,-length*.65);ctx.lineTo(-3,-length*.65+4);ctx.moveTo(0,-length*.65);ctx.lineTo(3,-length*.65+4);}
      ctx.lineWidth=4;ctx.strokeStyle='#091c39';ctx.stroke();ctx.lineWidth=1.8;ctx.strokeStyle=color;ctx.stroke();ctx.restore();
    }
    restartFlow();
  };
  const drawShips=()=>{
    if(shipContext)shipContext.clearRect(0,0,width,height);
    shipPoints=[];
    for(const ship of ships.values())ship.visible=false;
    for(const item of reports){
      const {x,y}=project(item.latitude,item.longitude);if(x<0||y<0||x>width||y>height)continue;
      shipPoints.push({x,y,item});
      if(!renderer){
        const ctx=shipContext;
        ctx.save();ctx.translate(x,y);ctx.rotate((item.bearing??0)*Math.PI/180);
        ctx.fillStyle=item.id===selection?'#fffbd9':'#ffc174';ctx.fillRect(-3,-6,6,12);ctx.fillRect(-1,-9,2,3);ctx.restore();continue;
      }
      let marker=ships.get(item.id);
      if(!marker){marker=new THREE.Sprite(new THREE.SpriteMaterial({map:sprite,transparent:true,depthTest:false}));scene.add(marker);ships.set(item.id,marker);}
      marker.visible=true;marker.position.set(x,height-y,0);marker.material.rotation=-(item.bearing??0)*Math.PI/180;
      marker.scale.set(item.id===selection?22:17,item.id===selection?25:19,1);
    }
    if(renderer)renderer.render(scene,camera);
    for(const [id,marker] of ships)if(!marker.visible){scene.remove(marker);marker.material.dispose();ships.delete(id);}
  };
  const redraw=()=>{drawField();drawTrail();drawShips();};
  const resize=()=>{
    const size=map.getSize();width=size.x;height=size.y;
    fieldCanvas.width=width;fieldCanvas.height=height;
    flowCanvas.width=width;flowCanvas.height=height;
    trailCanvas.width=width;trailCanvas.height=height;
    if(shipCanvas){shipCanvas.width=width;shipCanvas.height=height;}
    if(renderer){renderer.setSize(width,height,false);camera.right=width;camera.top=height;camera.updateProjectionMatrix();}
    redraw();
  };
  function manualPan(){if(followId){followId='';positionedId='';onManualPan();}}
  map.on('dragstart',manualPan);
  map.on('keydown',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.originalEvent.key))manualPan();});
  map.on('move zoom viewreset',redraw);map.on('zoomend',()=>onZoom(map.getZoom()));
  map.on('click',event=>{
    const p=event.containerPoint;
    const nearest=(list,tolerance)=>list.map(o=>[Math.hypot(o.x-p.x,o.y-p.y),o]).filter(([dist])=>dist<tolerance).sort((a,b)=>a[0]-b[0])[0]?.[1];
    const ship=nearest(shipPoints,11);
    if(ship){onPick({ship:ship.item});return;}
    const match=hitPoints.find(c=>p.x>=c.nw.x&&p.x<c.se.x&&p.y>=c.nw.y&&p.y<c.se.y) || nearest(hitPoints,5);
    if(match){onPick({vector:match.v,time:field.time});}
  });
  const observer=new ResizeObserver(()=>{map.invalidateSize({pan:false});limit();resize();});
  observer.observe(node);resize();onZoom(map.getZoom());
  const visibility=new IntersectionObserver(([entry])=>{viewVisible=entry.isIntersecting;restartFlow();});
  visibility.observe(node);document.addEventListener('visibilitychange',restartFlow);
  return {
    draw(items,_bounds,chosen){reports=items;selection=chosen;followShip();drawTrail();drawShips();},
    follow(id){if(id!==followId)positionedId='';followId=id;followShip();},
    setTrail(segments){trail=segments;drawTrail();},
    setField(data,visible,animated){field=data;showField=visible;animateFlow=animated;drawField();},
    zoom(delta){map.setZoom(map.getZoom()+delta);},
    fit(mode){manualPan();const region=mode==='harbor'?bounds(harbors[portId].bounds):coast;map.fitBounds(region,{padding:[8,8],maxZoom:13});},
    dispose(){clearTimeout(flowTimer);visibility.disconnect();document.removeEventListener('visibilitychange',restartFlow);observer.disconnect();map.off();map.remove();for(const m of ships.values())m.material.dispose();sprite?.dispose();renderer?.dispose();overlay.remove();}
  };
}
