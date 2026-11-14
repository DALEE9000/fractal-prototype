import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unpackCurrents } from '../lib/radar-field.js';

const grid = readFileSync(new URL('./fixtures/radar-grid.nc', import.meta.url));
const now = 1794672000000;

test('uses one observed hour, preserves calm cells and skips missing vectors', () => {
  const { time, vectors } = unpackCurrents(grid, now);
  assert.equal(time, new Date(now-3600000).toISOString());
  assert.equal(vectors.length, 3);
  assert.equal(vectors[0].bearing, 0);
  assert.equal(vectors[1].bearing, null);
  assert.equal(vectors[1].knots, 0);
  assert.ok(Math.abs(vectors[2].knots - 5*1.94384) < 0.00001);
  assert.ok(Math.abs(vectors[2].bearing - 36.87) < 0.01);
  assert.ok(Math.abs(vectors[2].lat - 40.4) < 0.0001);
  assert.ok(Math.abs(vectors[2].lon + 73.9) < 0.0001);
});

test('does not display expired radar fields', () => {
  assert.deepEqual(unpackCurrents(grid, now+13*3600000), {time:null,vectors:[]});
});
