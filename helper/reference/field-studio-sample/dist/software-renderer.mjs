import * as THREE from 'three';
// Perspective fallback uses the same field mesh as WebGL, including cutaway.
export class SoftwareRenderer {
 constructor(){this.domElement=document.createElement('canvas');this.ctx=this.domElement.getContext('2d');this.capabilities={getMaxAnisotropy:()=>1};this.software=true;this.ratio=1;this.last=''}
 setPixelRatio(r){this.ratio=Math.min(1.5,r)}
 setSize(w,h){this.w=w;this.h=h;this.domElement.width=w*this.ratio;this.domElement.height=h*this.ratio;this.domElement.style.width=w+'px';this.domElement.style.height=h+'px';this.last=''}
 render(scene,camera){
  camera.updateMatrixWorld();scene.updateMatrixWorld();
  const terrain=scene.children.find(o=>o.userData.terrain);if(!terrain)return;
  const key=camera.matrixWorld.elements.join(',')+scene.children.map(o=>o.id+':'+o.visible+':'+o.geometry?.id+':'+o.material?.map?.id+':'+o.material?.vertexColors).join();
  if(key===this.last)return;this.last=key;
  const ctx=this.ctx,w=this.w,h=this.h;ctx.setTransform(this.ratio,0,0,this.ratio,0,0);
  const gradient=ctx.createRadialGradient(w*.52,h*.42,10,w*.52,h*.42,w*.8);
  gradient.addColorStop(0,scene.userData.fieldMode?'#fcfcf4':'#dae2cf');gradient.addColorStop(1,scene.userData.fieldMode?'#dee3d6':'#b9c9ac');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const project=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).applyMatrix4(matrix);return{x:(v.x*.5+.5)*w,y:(-.5*v.y+.5)*h,z:v.z}};
  const path=vertices=>{ctx.beginPath();vertices.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()};
  if(scene.userData.shadow){const s=scene.userData.shadow;ctx.save();path(s.ring.map(([x,z])=>project(x,s.y,z)));ctx.shadowBlur=38;ctx.shadowOffsetY=15;ctx.shadowColor='#26382170';ctx.fillStyle='#67785435';ctx.fill();ctx.restore()}
  const faces=[];
  scene.traverse(mesh=>{
   if(!mesh.visible||!(mesh.userData.terrain||mesh.userData.soil))return;
   const g=mesh.geometry,p=g.attributes.position;
   const vertices=Array.from({length:p.count},(_,i)=>project(p.getX(i),p.getY(i),p.getZ(i)));
   const count=g.index?.count??p.count;
   for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k),v=ids.map(i=>vertices[i]);
    if(v.some(a=>a.z>1||a.z<0)||v.every(a=>a.x<0)||v.every(a=>a.x>w)||v.every(a=>a.y<0)||v.every(a=>a.y>h))continue;
    faces.push({ids,v,z:v.reduce((s,a)=>s+a.z,0),mesh});
   }
  });faces.sort((a,b)=>b.z-a.z);
  for(const f of faces){
   const {mesh,ids,v}=f,g=mesh.geometry,uv=g.attributes.uv,color=g.attributes.color,el=g.attributes.aElevation,image=mesh.material.map?.image;
   const [a,b,c]=v;
   if(image&&uv){
    const [[x0,y0],[x1,y1],[x2,y2]]=ids.map(i=>[uv.getX(i)*image.width,(1-uv.getY(i))*image.height]);
    const den=x0*(y1-y2)+x1*(y2-y0)+x2*(y0-y1);if(Math.abs(den)<1e-9)continue;
    const aa=(a.x*(y1-y2)+b.x*(y2-y0)+c.x*(y0-y1))/den,bb=(a.y*(y1-y2)+b.y*(y2-y0)+c.y*(y0-y1))/den;
    const cc=(a.x*(x2-x1)+b.x*(x0-x2)+c.x*(x1-x0))/den,dd=(a.y*(x2-x1)+b.y*(x0-x2)+c.y*(x1-x0))/den;
    const ee=(a.x*(x1*y2-x2*y1)+b.x*(x2*y0-x0*y2)+c.x*(x0*y1-x1*y0))/den,ff=(a.y*(x1*y2-x2*y1)+b.y*(x2*y0-x0*y2)+c.y*(x0*y1-x1*y0))/den;
    const mx=(a.x+b.x+c.x)/3,my=(a.y+b.y+c.y)/3;
    const expanded=v.map(p=>{const d=Math.hypot(p.x-mx,p.y-my)||1;return{x:p.x+(p.x-mx)/d*.6,y:p.y+(p.y-my)/d*.6}});
    ctx.save();path(expanded);ctx.clip();ctx.transform(aa,bb,cc,dd,ee,ff);ctx.drawImage(image,0,0);ctx.restore();
    if(mesh.userData.soil){path(v);ctx.fillStyle=mesh.userData.shade||'#1e180e12';ctx.fill()}
   }else{
    const col=new THREE.Color(0,0,0);if(color)ids.forEach(i=>col.add(new THREE.Color(color.getX(i),color.getY(i),color.getZ(i))));else col.copy(mesh.material.color).multiplyScalar(3);col.multiplyScalar(1/3);
    ctx.fillStyle='#'+col.getHexString();path(v);ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.6;ctx.stroke();
    if(el&&mesh.material.vertexColors){const min=Math.min(...ids.map(i=>el.getX(i))),max=Math.max(...ids.map(i=>el.getX(i)));for(let level=Math.ceil(min/2)*2;level<max;level+=2){const hits=[];for(let j=0;j<3;j++){const av=el.getX(ids[j]),bv=el.getX(ids[(j+1)%3]);if((av<=level&&bv>level)||(bv<=level&&av>level)){const t=(level-av)/(bv-av),p=v[j],q=v[(j+1)%3];hits.push([p.x+(q.x-p.x)*t,p.y+(q.y-p.y)*t])}}if(hits.length===2){ctx.beginPath();ctx.moveTo(...hits[0]);ctx.lineTo(...hits[1]);ctx.strokeStyle='#224f4566';ctx.lineWidth=.9;ctx.stroke()}}}
   }
  }
  for(const group of scene.children){
   if(!group.visible)continue;
   if(group.userData.lines){ctx.strokeStyle='#d5c6a0bb';ctx.lineWidth=1;for(const line of group.userData.lines){ctx.beginPath();line.forEach((p,i)=>{const v=project(...p);i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y)});ctx.stroke()}}
   if(group.userData.plants){
    const d=group.userData.plants,plants=d.positions.map(([x,y,z],i)=>({a:project(x,y,z),b:project(x,y+d.height*(.8+(i%7)/22),z),i})).filter(p=>p.a.z>0&&p.a.z<1).sort((a,b)=>b.a.z-a.a.z);
    for(const p of plants){if(p.a.x<0||p.a.x>w||p.a.y<0||p.a.y>h)continue;const len=Math.max(2,Math.hypot(p.a.y-p.b.y,p.a.x-p.b.x));
     ctx.strokeStyle=p.i%3===0?'#264d23':d.color;ctx.lineWidth=Math.max(.8,len*.1);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.a.x,p.a.y);ctx.lineTo(p.b.x,p.b.y);
     for(const side of [-1,1]){ctx.moveTo(p.a.x,p.a.y);ctx.quadraticCurveTo(p.b.x+side*len*.45,p.b.y+len*.35,p.b.x+side*len*.4,p.b.y+len*.6);ctx.moveTo(p.a.x,p.a.y);ctx.quadraticCurveTo(p.b.x+side*len*.22,p.b.y,p.b.x+side*len*.2,p.b.y+len*.15)}ctx.stroke();
     ctx.strokeStyle='#b7c76e99';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(p.a.x,p.a.y);ctx.lineTo(p.b.x,p.b.y);ctx.stroke();
     if(d.flower){ctx.fillStyle=d.flower;ctx.beginPath();ctx.ellipse(p.b.x,p.b.y,Math.max(1,len*.09),Math.max(1,len*.19),-.4,0,Math.PI*2);ctx.fill()}
    }
   }
   if(group.userData.boundary){ctx.beginPath();group.userData.boundary.forEach((p,i)=>{const v=project(p.x,p.y,p.z);i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y)});ctx.strokeStyle='#304d2bcc';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#d5ed9f';ctx.lineWidth=1.5;ctx.stroke()}
  }
 }
}
