import test from 'node:test';
import assert from 'node:assert/strict';
import {readTrack,rememberReports,trailSegments} from '../lib/vessel-trail.js';

const end=Date.UTC(2026,10,14,18),minute=60000;
const fix=(minutes,longitude)=>({time:end+minutes*minute,latitude:40.6,longitude});
test('trails stop at the playback clock, deduplicate timestamps and preserve gaps',()=>{
  const a=fix(-10,-74),b=fix(-8,-73.99),c=fix(-1,-73.9),d=fix(0,-73.88);
  const result=trailSegments([d,c,{...b,breakBefore:true},a,b,fix(1,-73.87),fix(-61,-74)],end);
  assert.deepEqual(result.map(s=>s.map(p=>p.longitude)),[[-74],[-73.99],[-73.9,-73.88]]);
});
test('session history only stores fresh, distinct reports and expires silent vessels',()=>{
  const histories=new Map(),a={...fix(-1,-74),id:'a'};
  rememberReports(histories,[a],end);rememberReports(histories,[a,{...a,latitude:null}],end);
  assert.equal(histories.get('a').length,1);
  rememberReports(histories,[],end+60*minute);assert.equal(histories.size,0);
});
test('provider track coordinates and breaks stay paired with their observation times and MMSI',()=>{
  const feature={geometry:{type:'LineString',coordinates:[[-74,40.6],[-73.9,40.7]]},
    properties:{mmsi:367513040,times:[new Date(end-minute).toISOString(),new Date(end).toISOString()],breaks:[1]}};
  const points=readTrack(feature,'367513040');
  assert.equal(points[0].longitude,-74);assert.equal(points[1].breakBefore,true);
  assert.equal(trailSegments(points,end).length,2);assert.deepEqual(readTrack(feature,'123456789'),[]);
});
