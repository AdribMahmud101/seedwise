import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutLeaderLabels } from '../src/legacy/studio3d-helpers.js';

const anchors = ['topsoil', 'rootzone', 'aquifer'].map((id, i) => ({ id, x: 240, y: 210 + i * 18 }));
const sizes = [{ width: 78, height: 26 }, { width: 92, height: 26 }, { width: 90, height: 26 }];
const overlaps = (a, b) => a.x < b.right && a.x + a.width > b.left && a.y < b.bottom && a.y + a.height > b.top;

function check(labels, bounds, obstacles = []) {
  assert.equal(labels.length, 3);
  assert.deepEqual(labels.map(p => p.id), anchors.map(p => p.id));
  for (const [i, p] of labels.entries()) {
    assert.ok(p.x >= bounds.left && p.x + p.width <= bounds.right);
    assert.ok(p.y >= bounds.top && p.y + p.height <= bounds.bottom);
    assert.ok(!overlaps(p, bounds.block));
    for (const o of obstacles) assert.ok(!overlaps(p, o), 'clear of controls/cards');
    for (const q of labels.slice(i + 1)) assert.ok(!overlaps(p, { left:q.x, right:q.x+q.width, top:q.y, bottom:q.y+q.height }));
    assert.deepEqual(p.points[0], [anchors[i].x, anchors[i].y]);
    assert.equal(p.points[1][1], anchors[i].y, 'leader begins horizontally');
    if (i) assert.ok(p.side === 'below' ? p.x >= labels[i-1].x + labels[i-1].width + 6
      : p.y >= labels[i-1].y + labels[i-1].height + 6, 'band order and 6px gap');
  }
}

test('leaders prefer right, fall back left, then a row below the block', () => {
  for (const [right, block, side] of [
    [600, {left:100,right:300,top:160,bottom:300}, 'right'],
    [400, {left:120,right:310,top:160,bottom:300}, 'left'],
    [330, {left:30,right:310,top:160,bottom:300}, 'below'],
  ]) {
    const bounds = {left:8,top:80,right,bottom:420,block};
    const labels = layoutLeaderLabels(anchors, sizes, bounds, []);
    check(labels, bounds);
    assert.ok(labels.every(p => p.side === side));
  }
});

test('labels and leader segments avoid the top bar, camera pill, and cards', () => {
  const bounds = {left:8,top:8,right:600,bottom:500,block:{left:140,right:360,top:160,bottom:300}};
  const obstacles = [{left:0,right:600,top:0,bottom:75}, {left:370,right:600,top:80,bottom:310},
    {left:0,right:600,top:450,bottom:500}];
  const labels = layoutLeaderLabels(anchors, sizes, bounds, obstacles);
  check(labels, bounds, obstacles);
  assert.ok(labels.every(p => p.side === 'left'));
  // Sample both segments, including endpoints, against every other label/control.
  for (const p of labels) for (let segment = 1; segment < p.points.length; segment++) {
    const a = p.points[segment-1], b = p.points[segment];
    for (let t = 0; t < 1; t += 0.01) {
      const dot = {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,width:0.01,height:0.01};
      for (const q of labels.filter(q => q !== p)) assert.ok(!overlaps(dot, {left:q.x,right:q.x+q.width,top:q.y,bottom:q.y+q.height}));
      for (const o of obstacles) assert.ok(!overlaps(dot, o));
    }
  }
});

test('impossible space hides annotations; empty input stays empty; inputs stay pure', () => {
  const original = structuredClone({anchors,sizes});
  assert.deepEqual(layoutLeaderLabels([], [], {left:0,top:0,right:100,bottom:100}, []), []);
  assert.deepEqual(layoutLeaderLabels(anchors, sizes, {left:0,top:0,right:50,bottom:20}, []), []);
  assert.deepEqual({anchors,sizes}, original);
});

test('off-canvas anchors hide their labels and leader lines', () => {
  const bounds = {left:8,top:8,right:600,bottom:500,block:{left:-80,right:300,top:160,bottom:300}};
  for (const [x,y] of [[-40,210],[610,210],[240,-5],[240,510]]) {
    assert.deepEqual(layoutLeaderLabels(anchors.map(a => ({...a,x,y})), sizes, bounds, []), []);
  }
});
