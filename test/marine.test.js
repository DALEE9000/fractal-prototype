import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBuoy, parseHarbor } from '../lib/marine.js';

const header = '#YY MM DD hh mm WDIR WSPD GST WVHT DPD\n#yr mo dy hr mn deg m/s m/s m sec\n';
const now = Date.parse('2026-11-14T10:15:00Z');
test('uses each newest available instrument reading with its own timestamp', () => {
  const data = parseBuoy(header + '2026 11 14 10 10 220 3 5 MM MM\n2026 11 14 10 00 220 2 5 1.5 12', now);
  assert.equal(data.wave.time, '2026-11-14T10:00:00.000Z');
  assert.equal(data.wind.time, '2026-11-14T10:10:00.000Z');
  assert.equal(data.period.value, 12);
  assert.ok(Math.abs(data.wave.value - 4.92) < .01);
});
test('omits stale, missing and malformed instruments', () => {
  assert.deepEqual(parseBuoy(header + '2026 11 10 08 00 0 3 5 2 12', now), {});
  assert.deepEqual(parseBuoy('upstream error', now), {});
  assert.equal(parseHarbor({ data: [{ v: '', t: '2026-11-14 10:00' }] }), null);
  assert.equal(parseHarbor({ error: {} }), null);
});
test('preserves zero and below-datum water levels', () => {
  for (const value of [0, -1.2]) assert.equal(parseHarbor({ data: [{t:'2026-11-14 10:00', v:String(value)}] }).value, value);
});
