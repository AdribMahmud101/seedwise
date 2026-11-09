import assert from 'node:assert/strict';
import {validatePolygon,areaHa,monthlyObservation,meanValid,pointInPolygon,weatherMonth} from './dist/core.mjs';
const s=[[89,25],[89.001,25],[89.001,25.001],[89,25.001]];
const cases=[['valid',()=>assert.equal(validatePolygon(s),null)],['reversed',()=>assert.equal(validatePolygon([...s].reverse()),null)],['empty',()=>assert.ok(validatePolygon([]))],['missing coordinate',()=>assert.ok(validatePolygon([[89,25],[89],[89.1,25.1]]))],['NaN',()=>assert.ok(validatePolygon([[89,25],[NaN,25],[89,25.1]]))],['crossed',()=>assert.ok(validatePolygon([s[0],s[2],s[1],s[3]]))],['duplicate',()=>assert.ok(validatePolygon([s[0],s[1],s[1],s[2]]))],['oversized',()=>assert.ok(validatePolygon([[89,25],[90,25],[90,26],[89,26]]))],['degenerate',()=>assert.ok(validatePolygon([[89,25],[89.001,25],[89.002,25]]))],['latitude',()=>assert.ok(validatePolygon([[89,91],[89.001,91],[89,91.001]]))],['area',()=>assert.ok(Math.abs(areaHa(s)-1.123)<.02)],['inside/outside',()=>{assert.ok(pointInPolygon([89.0005,25.0005],s));assert.equal(pointInPolygon([90,26],s),false)}],['cloudy',()=>assert.equal(monthlyObservation([['2025-01-03',null,0]],2025,0),null)],['wrong month',()=>assert.equal(monthlyObservation([['2025-02-03',.8,1]],2025,0),null)],['latest clear',()=>assert.equal(monthlyObservation([['2025-01-03',.8,1],['2025-01-10',.6,.8],['2025-01-20',null,0]],2025,0)[1],.6)],['missing mean',()=>assert.equal(meanValid([null,NaN]),null)],['real zero',()=>assert.equal(meanValid([0,2,null]),1)],['weather missing is not zero',()=>assert.equal(weatherMonth({start:'2025-01-01',p:{T2M:[null],PRECTOTCORR:[null]}},2025,0).rain,null)],['partial weather',()=>assert.equal(weatherMonth({start:'2025-01-01',p:{T2M:[20,22],PRECTOTCORR:[0,4]}},2025,0).days,2)]];
for(const [n,f]of cases){f();console.log('PASS',n)}console.log(cases.length+' checks passed');

// Field cutaway must preserve the selected outline, including concave shapes.
const {clipRing,fieldExtent}=await import('./dist/field-shape.mjs');
const signedArea=ring=>ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2;
const rect=[[0,0],[10,0],[10,6],[0,6]];
const lShape=[[0,0],[10,0],[10,2],[3,2],[3,8],[0,8]];
const assertShape=(name,ok)=>{if(!ok)throw Error(name);console.log('PASS '+name)};
assertShape('whole field preserved',Math.abs(signedArea(clipRing(rect,10)))===60);
assertShape('cut field area',Math.abs(signedArea(clipRing(rect,7)))===42);
assertShape('reverse outline',Math.abs(signedArea(clipRing([...rect].reverse(),7)))===42);
assertShape('concave outline clipped',Math.abs(signedArea(clipRing(lShape,5)))===28);
assertShape('outside cut is empty',clipRing(rect,-1).length===0);
assertShape('finite clipped vertices',clipRing(lShape,3).every(p=>p.every(Number.isFinite)));
assertShape('no field expansion',clipRing(lShape,5).every(p=>p[0]<=5&&p[0]>=0));
assertShape('extent accommodates narrow fields',fieldExtent([[0,0],[.1,0],[.1,150],[0,150]]).span===150);
console.log('8 cutaway geometry checks passed');
