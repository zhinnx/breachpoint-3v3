/**
 * Round-lifecycle gate. Reproduces the playtest report: "I suddenly die, then
 * next round I can't buy and can't move." Drives two full rounds through the
 * real build, including dying, and asserts recovery at every step.
 */
import puppeteer from 'puppeteer';
import { preview } from 'vite';

const server = await preview({ preview:{port:4220,host:'127.0.0.1'}, logLevel:'error' });
const b = await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--disable-dev-shm-usage']});
const p = await b.newPage();
await p.setViewport({width:1280,height:720});
const errs=[];
p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });

let fails=0;
const check=(n,c,x='')=>{ if(c) console.log(`   PASS  ${n}${x?` — ${x}`:''}`); else {console.log(`   FAIL  ${n} ${x}`); fails++;} };

await p.goto('http://127.0.0.1:4220/',{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForSelector('.lobby',{timeout:45000});
await p.click('.play-btn');
await p.waitForSelector('.hud',{timeout:30000});
await new Promise(r=>setTimeout(r,2500));

const snap=()=>p.evaluate(()=>{
  const st=window.__BP_STORE__.getState(); const pid=st.playerId;
  const e=st.entities[pid]; const a=window.__BP_WORLD__.actors[pid];
  return {phase:st.phase, round:st.round, alive:e.alive, hp:Math.round(e.hp),
    primary:e.loadout.primary, credits:e.credits, canBuy:st.canBuy(pid,1500),
    mapSolids:null, aAlive:a?a.alive:null};
});

const move=()=>p.evaluate(async ()=>{
  const st=window.__BP_STORE__.getState(); const a=window.__BP_WORLD__.actors[st.playerId];
  if(!a) return -1;
  a.pos=[0,0,-24]; a.yaw=0;
  const p0=[...a.pos];
  window.__BP_SIM__.input.forward=1;
  await new Promise(r=>setTimeout(r,1100));
  window.__BP_SIM__.input.forward=0;
  const p1=window.__BP_WORLD__.actors[st.playerId].pos;
  return +Math.hypot(p1[0]-p0[0],p1[2]-p0[2]).toFixed(2);
});

console.log('\n--- ROUND 1 ---');
let s1=await snap(); console.log('   ', JSON.stringify(s1));
check('R1 buy works', await p.evaluate(()=>{const st=window.__BP_STORE__.getState();
  return st.buyWeapon(st.playerId,'vanguard7');}));
// READY should shortcut the wait
await p.evaluate(()=>window.__BP_STORE__.getState().readyUp());
await new Promise(r=>setTimeout(r,1600));
s1=await snap();
check('READY starts combat fast', s1.phase==='COMBAT', `phase=${s1.phase}`);
check('R1 can move', (await move())>2);

// die
await p.evaluate(()=>{const st=window.__BP_STORE__.getState();
  st.applyDamage({targetId:st.playerId,attackerId:st.order[3],weaponId:'px1',amount:500,hitZone:'body',cause:'t'});});
await new Promise(r=>setTimeout(r,2200));
const dead=await snap();
check('death registered', dead.alive===false);
const camOk=await p.evaluate(()=>{
  const st=window.__BP_STORE__.getState();
  const cam=window.__BP_GL__?.gl; return !!cam;});
check('no crash during death cam', camOk && errs.length===0, errs.slice(0,1).join(''));

// end the round and wait out ROUND_END + BUY
await p.evaluate(()=>window.__BP_STORE__.getState().endRound('RED','probe'));
console.log('\n--- ROUND 2 (after dying) ---');
await p.waitForFunction(()=>window.__BP_STORE__.getState().round===2,{timeout:20000,polling:300}).catch(()=>{});
await new Promise(r=>setTimeout(r,1200));
const s2=await snap();
console.log('   ', JSON.stringify(s2));
check('advanced to round 2', s2.round===2, `round=${s2.round}`);
check('respawned alive', s2.alive===true);
check('HP reset to 100', s2.hp===100, `hp=${s2.hp}`);
check('weapon LOST after dying', s2.primary===null, `primary=${s2.primary}`);
check('can buy in round 2', s2.canBuy===true);
const bought=await p.evaluate(()=>{const st=window.__BP_STORE__.getState();
  const ok=st.buyWeapon(st.playerId,'raptor9');
  return {ok, primary: window.__BP_STORE__.getState().entities[st.playerId].loadout.primary};});
check('purchase succeeds in round 2', bought.ok && bought.primary==='raptor9', JSON.stringify(bought));
await p.evaluate(()=>{const st=window.__BP_STORE__.getState(); st.readyUp(); st.toggleBuyMenu(false);});
await new Promise(r=>setTimeout(r,1800));
check('R2 combat started', (await snap()).phase==='COMBAT');
const m2=await move();
check('can move in round 2', m2>2, `moved ${m2}m`);

// survive-the-round: weapon should PERSIST
console.log('\n--- ROUND 3 (survived) ---');
await p.evaluate(()=>window.__BP_STORE__.getState().endRound('BLUE','probe'));
await p.waitForFunction(()=>window.__BP_STORE__.getState().round===3,{timeout:20000,polling:300}).catch(()=>{});
await new Promise(r=>setTimeout(r,1000));
const s3=await snap();
check('weapon KEPT after surviving', s3.primary==='raptor9', `primary=${s3.primary}`);
check('HP reset again', s3.hp===100, `hp=${s3.hp}`);

const real=errs.filter(e=>!/favicon|SwiftShader|Automatic fallback|GroupMarker/i.test(e));
check('no console errors', real.length===0, real.slice(0,2).join(' | '));

await b.close(); await server.close();
console.log(`\n${fails===0?'ROUND FLOW GATE PASSED':`${fails} FAILURE(S)`}\n`);
process.exit(fails?1:0);
