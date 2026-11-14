import test from 'node:test';
import assert from 'node:assert/strict';
import { vesselWindow, aisBoxes, adjacentLon, sampleWindow, forecastTime, modelVector, pointQuery } from '../lib/world-ocean.js';
import { createVesselStore } from '../lib/us-ais.js';

test('wide views use no AIS stream and wrapped views fit the anonymous area cap',()=>{
  assert.equal(vesselWindow([-170,-80,170,80],2),'');
  const bbox=vesselWindow([179.8,-1,180.2,1],9).split(',').map(Number);
  assert.ok(bbox[0]>bbox[2]);const boxes=aisBoxes(bbox).map(b=>b.split(',').map(Number));
  assert.equal(boxes.length,2);assert.ok(boxes.reduce((sum,[s,w,n,e])=>sum+(n-s)*(e-w),0)<100);
  assert.equal(adjacentLon(-179.9,179),180.1);
  const store=createVesselStore(bbox),now=Date.now();
  for(const [i,lon] of [179.95,-179.95,0].entries()){
    store.event({type:'event',source:'digitraffic',mmsi:230000001+i,time:new Date(now).toISOString(),lat:0,lon,message:{MessageID:1}},now);
  }
  assert.equal(store.list(now).length,2);
});
test('model sampling stays bounded, preserves missing values and gives true-north bearings',()=>{
  const [w,s,e,n,dx,dy]=sampleWindow([-215,-78,215,82]).split(',').map(Number);
  assert.ok((1+(e-w)/dx)*(1+(n-s)/dy)<=30);
  const props={component1VariableId:'uo',component1Units:'m s-1',component1Value:1,component2VariableId:'vo',component2Units:'m s-1',component2Value:0,lat:0,lon:179.9};
  const vector=p=>modelVector({features:[{properties:p}]});
  assert.equal(vector(props).bearing,90);assert.equal(vector(props).knots,1.943844);
  assert.equal(vector({...props,component1Value:0}).bearing,null);
  assert.equal(vector({...props,component1Value:null}),null);
  const t=forecastTime(Date.UTC(2026,10,14,17,45));assert.equal(t,'2026-11-14T12:00:00.000Z');
  assert.equal(pointQuery(17,181,t),pointQuery(17,-179,t));
});
