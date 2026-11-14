import { aisBoxes } from './world-ocean.js';
const maxAge = 15 * 60_000;
const positionTypes = new Set([1, 2, 3, 18, 19, 27]);
const inRange = (value, limit) => Number.isFinite(value) && value >= 0 && value < limit;
const displayable = source => ['aishub','digitraffic','kystverket','barentswatch'].includes(source) || /^(station|udp|mmsi):/.test(source);
export function receiverLabel(source){
  return ({aishub:'AISHub',digitraffic:'Fintraffic',kystverket:'Kystverket',barentswatch:'BarentsWatch'})[source]||'Volunteer receiver';
}
const fresh = (time, now) => Number.isFinite(time) && time <= now + 60_000 && time > now - maxAge;

export function vesselType(code) {
  if (code >= 70 && code < 80) return 'Cargo';
  if (code >= 80 && code < 90) return 'Tanker';
  if (code >= 60 && code < 70) return 'Passenger';
  return ({30:'Fishing',31:'Towing',32:'Towing',33:'Dredging',35:'Military',36:'Sailing',37:'Pleasure craft',50:'Pilot',51:'Rescue',52:'Tug',53:'Port tender',55:'Law enforcement'})[code] || '';
}

export function createVesselStore([west,south,east,north]) {
  const vessels = new Map();
  const identities = new Map();
  function remember(id, name, type, time) {
    const old = identities.get(id);
    const clean = typeof name === 'string' ? name.replace(/@+$/,'').trim() : '';
    if ((!clean && !type) || (old && old.time > time)) return;
    identities.set(id,{name:clean || old?.name,type:type || old?.type,time});
  }
  function position(id, latitude, longitude, heading, cog, speed, time, source) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || vessels.get(id)?.time > time) return;
    const outside=west<=east ? longitude<west || longitude>east : longitude<west && longitude>east;
    if (latitude < south || latitude > north || outside) {
      vessels.delete(id);
      return;
    }
    vessels.set(id,{id,latitude,longitude,time,source,
      bearing:inRange(heading,360) ? heading : inRange(cog,360) ? cog : null,
      speed:inRange(speed,102.3) ? speed : null});
  }
  function validId(id) { return /^[2-7]\d{8}$/.test(id); }
  return {
    snapshot(features, now=Date.now()) {
      for (const {geometry,properties:p} of features) {
        if (!p || !displayable(p.source) || p.kind !== 'vessel' || geometry?.type !== 'Point') continue;
        const id = String(p.mmsi), time = Date.parse(p.seen);
        if (!validId(id) || !fresh(time,now)) continue;
        remember(id,p.name,p.type,time);
        position(id,geometry.coordinates[1],geometry.coordinates[0],p.heading,p.cog,p.sog,time,p.source);
      }
    },
    event(event, now=Date.now()) {
      const m = event.message, id = String(event.mmsi), time = Date.parse(event.time);
      if (event.type !== 'event' || !m || !displayable(event.source) || !validId(id) || !fresh(time,now)) return;
      remember(id,m.Name || m.ReportA?.Name,m.Type || m.ReportB?.ShipType,time);
      if (positionTypes.has(m.MessageID)) position(id,event.lat,event.lon,m.TrueHeading,m.Cog,m.Sog,time,event.source);
    },
    list(now=Date.now()) {
      const result = [];
      for (const [id,ship] of vessels) {
        if (!fresh(ship.time,now)) { vessels.delete(id); continue; }
        const identity = identities.get(id);
        result.push({...ship,name:identity?.name || 'MMSI '+id,kind:vesselType(identity?.type)});
      }
      for (const [id,identity] of identities) if (!vessels.has(id) && !fresh(identity.time,now)) identities.delete(id);
      return result.sort((a,b)=>(b.speed??0)-(a.speed??0) || a.id.localeCompare(b.id));
    }
  };
}

// The visitor connects to the upstream directly. Harbor Ledger exposes no raw AIS feed.
export function watchUsAis(bounds, onUpdate) {
  const boxes=aisBoxes(bounds);
  const queryFor=fields=>{
    const query=new URLSearchParams(fields);
    for(const bbox of boxes)query.append('bbox',bbox);
    return query;
  };
  const base = 'https://ais.openwaters.io/v1/';
  const store = createVesselStore(bounds);
  const controller = new AbortController();
  let stream, status='Connecting', dirty=true, fallbackTimer, retryTimer, snapshotBusy=false;
  const publish = () => { onUpdate(store.list(),status); dirty=false; };
  async function snapshot() {
    if (snapshotBusy || controller.signal.aborted) return;
    snapshotBusy=true;
    try {
      const query = queryFor({kind:'vessel',max_age:'15m',max_age_moving:'15m'});
      const response = await fetch(base+'vessels?'+query,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
      if (!response.ok) throw Error();
      store.snapshot((await response.json()).features);
      if (status!=='Streaming') status='Latest reports';
    } catch { if (status!=='Streaming') status='Connection interrupted'; }
    finally { snapshotBusy=false; if (!controller.signal.aborted) publish(); }
  }
  function connect() {
    if (controller.signal.aborted) return;
    stream = new EventSource(base+'stream?'+queryFor({snapshot:'1'}));
    stream.onmessage = ({data}) => {
      let event;
      try { event=JSON.parse(data); } catch { return; }
      if (event.type==='error') { disconnected(); return; }
      status='Streaming'; dirty=true;
      clearInterval(fallbackTimer); fallbackTimer=undefined;
      store.event(event);
    };
    stream.onerror = disconnected;
  }
  function disconnected() {
    stream.close();
    status='Reconnecting'; dirty=true;
    // Shared IPs can reach the anonymous connection limit. A bounded snapshot keeps the map usable.
    if (!fallbackTimer) fallbackTimer=setInterval(snapshot,60_000);
    clearTimeout(retryTimer); retryTimer=setTimeout(connect,65_000);
    snapshot();
  }
  snapshot(); connect();
  const renderTimer=setInterval(()=>{if(dirty) publish();},750);
  const expireTimer=setInterval(publish,10_000);
  return () => {
    controller.abort(); stream?.close();
    clearInterval(renderTimer); clearInterval(expireTimer); clearInterval(fallbackTimer); clearTimeout(retryTimer);
  };
}
