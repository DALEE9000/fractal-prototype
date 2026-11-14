import test from 'node:test';
import assert from 'node:assert/strict';
import { radarCurrent } from '../lib/currents.js';
import { interpolate,visibleReports } from '../lib/traffic.js';
test('radar converts m/s into knots and direction toward true north',()=>{
  const header='time,station,lat,lon,u[unit="m s-1"],v[unit="m s-1"]\n';
  const now=Date.parse('2026-11-14T14:00:00Z');
  const sample=header+'2026-11-14T13:00:00Z,grid,40,-74,-1,0\n2026-11-14T14:00:00Z,grid,40,-74,NaN,NaN';
  assert.equal(radarCurrent(sample,now).towards,270);
  assert.equal(radarCurrent(sample,now).value,1.94384);
  assert.equal(radarCurrent(sample,now+24*3600000),null);
});
test('replays only between actual nearby reports',()=>{
  const p=[[0,0,0,90],[60,2,4,90],[900,8,8,90]];
  assert.deepEqual(interpolate(p,30),{longitude:1,latitude:2,bearing:90});
  assert.equal(interpolate(p,100),null);
  assert.equal(interpolate(p,901),null);
});
test('stale and out-of-harbor reports are excluded',()=>{
  const v={latitude:4,longitude:2,time:1000000};
  assert.deepEqual(visibleReports([v,{...v,latitude:8},{...v,time:0}],[0,0,5,5],1000000),[v]);
});
