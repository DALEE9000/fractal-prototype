import { charts,basemapBounds } from '../lib/chart-areas.js';
import { harbors } from '../lib/traffic.js';

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

export async function mountChart(node,portId,onZoom,onPick,signal) {
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
  let renderer,scene,camera,sprite;
  try{
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});
    renderer.setClearColor(0,0);renderer.setPixelRatio(1);
    overlay.appendChild(renderer.domElement);scene=new THREE.Scene();
    camera=new THREE.OrthographicCamera(0,1,1,0,.1,100);camera.position.z=10;
    sprite=makeShipSprite(THREE);
  }catch{renderer=null;}
  const ships=new Map();
  let width=1,height=1,reports=[],selection='',field=null,showField=true,hitPoints=[],shipPoints=[];
  const project=(lat,lon)=>map.latLngToContainerPoint([lat,lon]);
  const drawField=()=>{
    ctx.clearRect(0,0,width,height);
    hitPoints=[];if(!showField||!field)return;
    for(const v of field.vectors){
      const {x,y}=project(v.lat,v.lon);if(x<0||y<0||x>width||y>height)continue;
      hitPoints.push({x,y,v});
      ctx.save();ctx.translate(x,y);ctx.rotate((v.bearing??0)*Math.PI/180);
      const length=7+Math.min(v.knots,2)*7;
      ctx.beginPath();if(v.bearing===null){ctx.arc(0,0,2,0,Math.PI*2);}else{ctx.moveTo(0,length*.35);ctx.lineTo(0,-length*.65);ctx.lineTo(-3,-length*.65+4);ctx.moveTo(0,-length*.65);ctx.lineTo(3,-length*.65+4);}
      ctx.lineWidth=4;ctx.strokeStyle='#091c39';ctx.stroke();ctx.lineWidth=1.8;ctx.strokeStyle='#6aeaff';ctx.stroke();ctx.restore();
    }
  };
  const drawShips=()=>{
    if(!renderer)drawField();
    shipPoints=[];
    for(const ship of ships.values())ship.visible=false;
    for(const item of reports){
      const {x,y}=project(item.latitude,item.longitude);if(x<0||y<0||x>width||y>height)continue;
      shipPoints.push({x,y,item});
      if(!renderer){
        ctx.save();ctx.translate(x,y);ctx.rotate((item.bearing??0)*Math.PI/180);
        ctx.fillStyle=item.id===selection?'#fffbd9':'#ffc174';ctx.fillRect(-3,-6,6,12);ctx.fillRect(-1,-9,2,3);ctx.restore();continue;
      }
      let marker=ships.get(item.id);
      if(!marker){marker=new THREE.Sprite(new THREE.SpriteMaterial({map:sprite,transparent:true,depthTest:false}));scene.add(marker);ships.set(item.id,marker);}
      marker.visible=true;marker.position.set(x,height-y,0);marker.material.rotation=-(item.bearing??0)*Math.PI/180;
      marker.scale.set(item.id===selection?22:17,item.id===selection?25:19,1);
    }
    if(renderer)renderer.render(scene,camera);
  };
  const redraw=()=>{drawField();drawShips();};
  const resize=()=>{
    const size=map.getSize();width=size.x;height=size.y;
    fieldCanvas.width=width;fieldCanvas.height=height;
    if(renderer){renderer.setSize(width,height,false);camera.right=width;camera.top=height;camera.updateProjectionMatrix();}
    redraw();
  };
  map.on('move zoom viewreset',redraw);map.on('zoomend',()=>onZoom(map.getZoom()));
  map.on('click',event=>{
    const p=event.containerPoint;
    const nearest=(list,tolerance)=>list.map(o=>[Math.hypot(o.x-p.x,o.y-p.y),o]).filter(([dist])=>dist<tolerance).sort((a,b)=>a[0]-b[0])[0]?.[1];
    const ship=nearest(shipPoints,11);
    if(ship){onPick({ship:ship.item});return;}
    const match=nearest(hitPoints,12);
    if(match){onPick({vector:match.v,time:field.time});}
  });
  const observer=new ResizeObserver(()=>{map.invalidateSize({pan:false});limit();resize();});
  observer.observe(node);resize();onZoom(map.getZoom());
  return {
    draw(items,_bounds,chosen){reports=items;selection=chosen;drawShips();},
    setField(data,visible){field=data;showField=visible;redraw();},
    zoom(delta){map.setZoom(map.getZoom()+delta);},
    fit(mode){const region=mode==='harbor'?bounds(harbors[portId].bounds):coast;map.fitBounds(region,{padding:[8,8],maxZoom:13});},
    dispose(){observer.disconnect();map.off();map.remove();for(const m of ships.values())m.material.dispose();sprite?.dispose();renderer?.dispose();overlay.remove();}
  };
}
