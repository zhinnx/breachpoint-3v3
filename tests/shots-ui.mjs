import puppeteer from 'puppeteer';
import { preview } from 'vite';
const server = await preview({ preview:{port:4202,host:'127.0.0.1'}, logLevel:'error' });
const b = await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage']});

const shots = [
  {n:'ui-lobby-desktop', w:1280,h:800, touch:false, stage:'lobby'},
  {n:'ui-lobby-phone',   w:390, h:844, touch:true,  stage:'lobby'},
  {n:'ui-hud-desktop',   w:1280,h:800, touch:false, stage:'combat'},
  {n:'ui-hud-phone-land',w:844, h:390, touch:true,  stage:'combat'},
  {n:'ui-hud-phone-port',w:390, h:844, touch:true,  stage:'combat'},
  {n:'ui-buy-phone',     w:844, h:390, touch:true,  stage:'buy'},
  {n:'ui-buy-desktop',   w:1280,h:800, touch:false, stage:'buy'},
];

for (const s of shots) {
  const p = await b.newPage();
  p.on('pageerror',e=>console.log('ERR',s.n,e.message));
  await p.emulate({viewport:{width:s.w,height:s.h,isMobile:s.touch,hasTouch:s.touch,deviceScaleFactor:2},
    userAgent: s.touch
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'});
  await p.goto('http://127.0.0.1:4202/',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForSelector('.lobby',{timeout:45000});
  await new Promise(r=>setTimeout(r,3500));
  if (s.stage!=='lobby') {
    await p.click('.play-btn');
    await p.waitForSelector('.hud',{timeout:30000});
    await new Promise(r=>setTimeout(r,1500));
    if (s.stage==='combat') {
      await p.evaluate(()=>{const st=window.__BP_STORE__.getState();st.toggleBuyMenu(false);
        st.buyWeapon(st.playerId,'vanguard7'); st.buyArmor(st.playerId,'heavy');
        st.buyUtility(st.playerId,'frag'); st.buyUtility(st.playerId,'flash'); st.beginCombat();});
      await new Promise(r=>setTimeout(r,600));
      await p.addStyleTag({content:'.engage,.death,.hurt-ov{display:none!important}'});
      await p.evaluate(()=>{const st=window.__BP_STORE__.getState();
        setInterval(()=>{const q=window.__BP_STORE__.getState();
          q.patchEntity(q.playerId,{alive:true,hp:78});},200);
        const a=window.__BP_WORLD__.actors[st.playerId]; if(a){a.pos=[0,0,-14];a.yaw=0;a.pitch=0.03;}});
    } else {
      await p.evaluate(()=>window.__BP_STORE__.getState().toggleBuyMenu(true));
    }
    await new Promise(r=>setTimeout(r,4500));
  }
  await p.screenshot({path:`tests/${s.n}.png`});
  console.log('captured', s.n);
  await p.close();
}
await b.close(); await server.close();
