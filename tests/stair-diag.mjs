import { SOLIDS } from '../src/game/steelfall.js';

const AGENT_RADIUS = 0.42, AGENT_HEIGHT = 1.72, STEP_UP = 0.55, FLOOR_CLUSTER = 1.9, MAX_HEIGHT = 9.0;
function surfacesAt(cx, cz) {
  const cands = [];
  for (const s of SOLIDS) {
    if (cx < s.min[0] || cx > s.max[0]) continue;
    if (cz < s.min[2] || cz > s.max[2]) continue;
    const h = s.max[1];
    if (h < -0.5 || h > MAX_HEIGHT) continue;
    cands.push(h);
  }
  if (!cands.length) return { levels: [], blockedBy: [] };
  cands.sort((a,b)=>b-a);
  const levels=[]; let top=cands[0], prev=cands[0];
  for (let i=1;i<=cands.length;i++){const h=cands[i];
    if(h===undefined||prev-h>FLOOR_CLUSTER){levels.push(top); if(h===undefined)break; top=h;} prev=h;}
  const out=[]; const blocked=[];
  for (const h of levels){
    const headY=h+AGENT_HEIGHT, footY=h+0.12; let b=null;
    for (const s of SOLIDS){
      if (s.max[1] <= h+STEP_UP) continue;
      if (s.min[1] >= headY) continue;
      if (s.max[1] <= footY) continue;
      if (cx+AGENT_RADIUS <= s.min[0] || cx-AGENT_RADIUS >= s.max[0]) continue;
      if (cz+AGENT_RADIUS <= s.min[2] || cz-AGENT_RADIUS >= s.max[2]) continue;
      b = s; break;
    }
    if (b) blocked.push([h.toFixed(2), b.surf, JSON.stringify(b.min.map(n=>+n.toFixed(1))), JSON.stringify(b.max.map(n=>+n.toFixed(1)))]);
    else out.push(h);
  }
  return { levels: out, blockedBy: blocked };
}
console.log('STAIR A column (x=-7.5), z from 6 down to -3:');
for (let iz=6; iz>=-3; iz--) {
  const r = surfacesAt(-7.5, iz+0.5);
  console.log(`  z=${(iz+0.5).toFixed(1).padStart(5)}  walkable=[${r.levels.map(h=>h.toFixed(2)).join(', ')}]  blocked=${JSON.stringify(r.blockedBy)}`);
}
console.log('\nSTAIR A column (x=-6.5):');
for (let iz=6; iz>=-3; iz--) {
  const r = surfacesAt(-6.5, iz+0.5);
  console.log(`  z=${(iz+0.5).toFixed(1).padStart(5)}  walkable=[${r.levels.map(h=>h.toFixed(2)).join(', ')}]  blocked=${JSON.stringify(r.blockedBy)}`);
}
