import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCameraToBlock, projectFramingBox, solveFramingMultiplier } from '../src/legacy/studio3d-helpers.js';

// A fit to canvas edges alone lets terrain and idle sway cross the overlays.
test('default framing contains raised terrain and the entire idle sway in the free region', () => {
  const outlineM = [[-20,-12],[20,-12],[16,12],[-18,10]];
  for (const [width, height, region] of [
    [640,700,{left:0.36,top:0.43,right:0.98,bottom:0.83}],
    [356,1092,{left:72/356,top:360/1092,right:340/356,bottom:572/1092}],
    [1000,700,{left:0.35,top:0.43,right:0.98,bottom:0.83}],
  ]) {
    const options = { outlineM, depthM:7, topM:8, bottomM:-7, aspect:width/height,
      targetFrac:0.6, region, swayDeg:7, maxMult:8 };
    const solved = solveFramingMultiplier(options);
    const fit = fitCameraToBlock({...options,fovDeg:38,elevationDeg:14,yawDeg:10,margin:0.18});
    assert.equal(solved.fits, true);
    if (width === 640) assert.ok(solved.widthFrac >= 0.59, 'use the available field width');
    for (const yaw of [3,6,10,14,17]) {
      const distance = fit.distance * solved.multiplier * 0.99;
      const el = 14*Math.PI/180, a = yaw*Math.PI/180;
      const target = [fit.target[0],-7*0.45,fit.target[2]];
      const position = [target[0]+Math.cos(el)*Math.sin(a)*distance,
        target[1]+Math.sin(el)*distance,target[2]+Math.cos(el)*Math.cos(a)*distance];
      const corners = outlineM.flatMap(([x,y])=>[[x,8,-y],[x,-7,-y]]);
      const box = projectFramingBox(corners,{position,target,aspect:width/height,
        viewOffsetX:solved.viewOffsetX,viewOffsetY:solved.viewOffsetY});
      assert.ok((box.minX+1)/2 >= region.left-1e-6,'clear of left column');
      assert.ok((box.maxX+1)/2 <= region.right+1e-6,'inside right edge');
      assert.ok((1-box.maxY)/2 >= region.top-1e-6,'below title and hint');
      assert.ok((1-box.minY)/2 <= region.bottom+1e-6,'above bottom cards');
      assert.ok(box.widthFrac <= 0.601,'width capped near 60%');
    }
  }
});
