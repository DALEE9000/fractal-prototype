import test from 'node:test';
import assert from 'node:assert/strict';
import { createVesselStore } from '../lib/us-ais.js';
import { currentColor } from '../lib/current-scale.js';

const now=Date.UTC(2026,10,14,18), iso=ms=>new Date(ms).toISOString();
const id=367513040;
const position={type:'event',mmsi:id,source:'aishub',time:iso(now),lat:42.35,lon:-71.01,
  message:{MessageID:1,TrueHeading:511,Cog:194,Sog:5.5}};
const bounds=[-71.18,42.13,-70.45,42.53];

test('stream updates outrank late snapshots and static messages do not refresh position age',()=>{
  const store=createVesselStore(bounds);
  store.event(position,now);
  store.snapshot([{geometry:{type:'Point',coordinates:[-71.05,42.38]},properties:{
    mmsi:id,kind:'vessel',seen:iso(now-10_000),name:'LIBERTY',type:52,source:'aishub'
  }}],now);
  store.event({...position,time:iso(now+1000),message:{MessageID:5,Name:'LIBERTY'}},now+1000);
  const [ship]=store.list(now+1000);
  assert.deepEqual([ship.name,ship.kind,ship.speed,ship.bearing,ship.latitude,ship.time],['LIBERTY','Tug',5.5,194,42.35,now]);
  assert.deepEqual(store.list(now+15*60_000),[]);
});

test('only current vessel positions from displayable sources inside the chart are kept',()=>{
  const store=createVesselStore(bounds);
  store.event({...position,source:'aisstream'},now);
  store.event({...position,mmsi:993675555},now);
  store.event({...position,lat:null},now);
  assert.equal(store.list(now).length,0);
  store.event({...position,source:'udp:123',message:{MessageID:18,Sog:102.3,Cog:360,TrueHeading:511}},now);
  assert.equal(store.list(now)[0].speed,null);
  assert.equal(store.list(now)[0].bearing,null);
  store.event({...position,lon:-74,time:iso(now+1000)},now+1000);
  assert.equal(store.list(now+1000).length,0);
});

test('the current speed legend uses a single inclusive lower edge at each threshold',()=>{
  assert.equal(new Set([0,.25,.5,1,2].map(currentColor)).size,5);
  assert.equal(currentColor(.249),currentColor(0));
  assert.equal(currentColor(8),currentColor(2));
});
