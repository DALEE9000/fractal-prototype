import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { forecastTiles, vesselWindow, oceanPlaces, sampleWindow } from '../lib/world-ocean.js';

function worldTiles(L,signal,onError){
  const template=fetch('https://tiles.openfreemap.org/planet',{signal}).then(async response=>{
    if(!response.ok)throw Error('Map source unavailable');
    return (await response.json()).tiles[0];
  });
  const layer=L.gridLayer({tileSize:256,maxNativeZoom:14,keepBuffer:1,updateWhenIdle:true});
  const requests=new WeakMap();
  layer.createTile=(coords,done)=>{
    const tile=document.createElement('canvas');tile.width=tile.height=256;
    const ctrl=new AbortController();requests.set(tile,ctrl);
    const ctx=tile.getContext('2d');ctx.fillStyle='#304e68';ctx.fillRect(0,0,256,256);
    (async()=>{
      const url=L.Util.template(await template,coords);
      const response=await fetch(url,{signal:AbortSignal.any([signal,ctrl.signal])});
      if(!response.ok && response.status!==204)throw Error('Map tile unavailable');
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(!bytes.length)return;
      const {layers}=new VectorTile(new PbfReader(bytes));
      for(const [name,color,stroke] of [['landcover','#38596b'],['water','#0e2e48'],['waterway','#254d69',.8],['boundary','#71879a',.55],['transportation','#628196',.65]]){
        const features=layers[name];if(!features)continue;
        ctx.fillStyle=ctx.strokeStyle=color;ctx.lineWidth=stroke||1;
        for(let i=0;i<features.length;i++){
          const f=features.feature(i);if(f.type===1 || (!stroke&&f.type!==3))continue;
          if(name==='transportation' && coords.z<7)continue;
          ctx.beginPath();
          for(const ring of f.loadGeometry()){
            for(const [j,p] of ring.entries()){
              const x=p.x*256/f.extent,y=p.y*256/f.extent;
              if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
            }
            if(f.type===3)ctx.closePath();
          }
          if(stroke)ctx.stroke();else ctx.fill('evenodd');
        }
      }
      const places=layers.place;
      if(places){
        ctx.font='11px Consolas, monospace';ctx.textAlign='center';ctx.lineWidth=3;
        const occupied=[];
        for(let i=0;i<places.length;i++){
          const f=places.feature(i),p=f.properties;
          const allowed=coords.z<=2?['continent']:coords.z<4?['country']:coords.z<7?['country','city','state']:['city','town','suburb'];
          if(!allowed.includes(p.class)||Number(p.rank||0)>(coords.z<5?2:5))continue;
          const loc=f.loadGeometry()[0]?.[0],name=p['name:en']||p.name;
          if(!loc||!name)continue;
          const x=loc.x*256/f.extent,y=loc.y*256/f.extent;
          const radius=ctx.measureText(name).width/2+3;
          if(x<radius||x>256-radius||y<10||y>249||occupied.some(box=>Math.abs(x-box.x)<radius+box.radius&&Math.abs(y-box.y)<13))continue;
          occupied.push({x,y,radius});
          ctx.strokeStyle='#152d40';ctx.fillStyle='#d9eaf5';ctx.strokeText(name,x,y);ctx.fillText(name,x,y);
        }
      }
    })().then(()=>done(null,tile),err=>{
      if(!ctrl.signal.aborted&&!signal.aborted){ctx.clearRect(0,0,256,256);onError('Some coastline tiles are unavailable.');}
      done(err,tile);
    });
    return tile;
  };
  layer.on('tileunload',e=>requests.get(e.tile)?.abort());
  return layer;
}

export function addWorldLayers(L,map,options,signal){
  worldTiles(L,signal,options.onMapError).addTo(map);
  const pane=map.createPane('forecastTiles');pane.style.zIndex=240;pane.style.pointerEvents='none';
  const ocean=L.tileLayer('',{pane:'forecastTiles',maxNativeZoom:9,maxZoom:15,opacity:.58,updateWhenIdle:true});
  ocean.on('tileerror',()=>options.onForecastStatus('Some forecast tiles are unavailable.'));
  ocean.on('tileload',()=>options.onForecastStatus(''));
  let key=null,timer,validTime;
  function viewport(){
    const b=map.getBounds(),box=[b.getWest(),Math.max(-85,b.getSouth()),b.getEast(),Math.min(85,b.getNorth())],next=vesselWindow(box,map.getZoom());
    if(next!==key){key=next;options.onWindow(next);}
    options.onSamples(sampleWindow(box));
  }
  function moved(){clearTimeout(timer);timer=setTimeout(viewport,450);}
  map.on('moveend resize',moved);
  const markers=L.layerGroup().addTo(map);
  for(const [id,place] of Object.entries(oceanPlaces)){
    if(id==='world')continue;
    const marker=L.circleMarker(place.center,{radius:5,color:'#bdedff',weight:2,fillColor:'#276783',fillOpacity:1})
      .bindTooltip(place.label,{direction:'top'}).on('click',()=>map.setView(place.center,place.zoom));
    markers.addLayer(marker);
  }
  function ports(){if(map.getZoom()>6)markers.remove();else markers.addTo(map);}
  map.on('zoomend',ports);
  viewport();ports();
  return {
    forecast(time,enabled){
      if(!enabled){ocean.remove();return;}
      if(validTime!==time){validTime=time;ocean.setUrl(forecastTiles(time));}
      if(!map.hasLayer(ocean))ocean.addTo(map);
    },
    dispose(){clearTimeout(timer);map.off('moveend resize',moved);map.off('zoomend',ports);}
  };
}
