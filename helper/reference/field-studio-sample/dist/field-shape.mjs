export function clipRing(ring, maxX = Infinity) {
 const out=[];
 for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(a[0]<=maxX)out.push([...a]);if((a[0]<=maxX)!==(b[0]<=maxX)){const t=(maxX-a[0])/(b[0]-a[0]);out.push([maxX,a[1]+t*(b[1]-a[1])])}}
 return out.filter((p,i)=>!i||Math.hypot(p[0]-out[i-1][0],p[1]-out[i-1][1])>1e-8);
}
export function fieldExtent(ring){const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);return{minX,maxX,minZ,maxZ,span:Math.max(maxX-minX,maxZ-minZ,20)}}
