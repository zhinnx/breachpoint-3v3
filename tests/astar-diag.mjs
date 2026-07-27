import { buildNavMesh, getPathfinding, ZONE } from '../src/game/navmesh.js';
import * as THREE from 'three';
buildNavMesh();
const pf = getPathfinding();
const zone = pf.zones[ZONE];
const g = zone.groups[0];
console.log('polys in group0:', g.length);
// Are neighbour links symmetric / valid indices?
let bad=0, isolated=0, nbTotal=0;
for (const p of g) {
  nbTotal += p.neighbours.length;
  if (p.neighbours.length === 0) isolated++;
  for (const n of p.neighbours) if (n < 0 || n >= g.length) bad++;
}
console.log('avg neighbours:', (nbTotal/g.length).toFixed(2), 'isolated polys:', isolated, 'bad idx:', bad);

// BFS connectivity within the group's own adjacency
const seen = new Uint8Array(g.length); const q=[0]; seen[0]=1; let cnt=1;
while(q.length){const i=q.pop(); for(const n of g[i].neighbours){ if(!seen[n]){seen[n]=1;cnt++;q.push(n);} }}
console.log('BFS reachable from poly0:', cnt, '/', g.length);

// find which poly the endpoints land on
const probe=(pt)=>{const v=new THREE.Vector3(...pt); const n=pf.getClosestNode(v,ZONE,0,true)||pf.getClosestNode(v,ZONE,0,false); return n?n.id:null;};
const a=probe([0,0,-18]), b=probe([0,0,18]);
console.log('poly a=',a,'poly b=',b, 'seenA=',a!=null?seen[a]:'-', 'seenB=',b!=null?seen[b]:'-');
// run raw astar
const path = pf.findPath(new THREE.Vector3(0,0,-18), new THREE.Vector3(0,0,18), ZONE, 0);
console.log('raw findPath ->', path ? path.length+' wp' : path);
// try slightly different endpoints
for (const [p1,p2,label] of [
  [[0,0,-18],[0,0,10],'mid -> z=10'],
  [[0,0,-18],[0,0,0],'mid -> centre'],
  [[0,0,-18],[3,0,14],'mid -> z=14 offset'],
  [[0,0,-18],[0,0,16],'mid -> z=16'],
  [[0,0,-18],[0,0,20],'mid -> z=20'],
]) {
  let r; try { r = pf.findPath(new THREE.Vector3(...p1), new THREE.Vector3(...p2), ZONE, 0);} catch(e){r='ERR '+e.message;}
  console.log(' ', label.padEnd(22), Array.isArray(r)? r.length+' wp' : r);
}
