// Drives headless Chrome over the DevTools protocol (Node's built-in WebSocket) and saves screenshots to test/shots/.
//   node test/shots.js [all|customer|staff|take|screens|player|langs]   (CHROME=/path/to/chrome to override)
// Works against test/mock-server.js or the real PHP backend (test/serve.sh): it signs in when the login form shows.
const {spawn}=require('child_process'),fs=require('fs'),path=require('path'),os=require('os');
const CHROME=process.env.CHROME||['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const OUT=path.join(__dirname,'shots');fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const B='http://127.0.0.1:4190';
const TOK='tok1a1b2c3d4e5f6a7b8c9d0e1f2';
const EMAIL=process.env.APS_EMAIL||'nadia@darzellige.ma',PASS=process.env.APS_PASS||'zellige-test-passphrase-2026';
const scenario=process.argv[2]||'all',want=s=>scenario==='all'||scenario===s;
(async()=>{
 const prof=fs.mkdtempSync(path.join(os.tmpdir(),'apsprof-'));
 const ch=spawn(CHROME,['--headless=new','--remote-debugging-port=9333','--user-data-dir='+prof,'--no-first-run','--no-sandbox','--hide-scrollbars','--autoplay-policy=no-user-gesture-required','about:blank'],{stdio:'ignore'});
 for(let i=0;i<60;i++){try{await (await fetch('http://127.0.0.1:9333/json/version')).json();break}catch{await sleep(250)}}
 const tgt=await (await fetch('http://127.0.0.1:9333/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pend={},errors=[];
 ws.onmessage=m=>{const x=JSON.parse(m.data);if(x.id&&pend[x.id]){pend[x.id](x);delete pend[x.id]}if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.exception?.description||x.params.exceptionDetails.text);if(x.method==='Runtime.consoleAPICalled'&&x.params.type==='error')errors.push(x.params.args.map(a=>a.value||a.description).join(' '));if(x.method==='Log.entryAdded'&&x.params.entry.level==='error'&&!/Refused to apply inline style/.test(x.params.entry.text))errors.push(x.params.entry.text+' '+(x.params.entry.url||''))};
 const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
 await send('Runtime.enable');await send('Page.enable');await send('Log.enable');
 const size=async(w,hgt,mobile,dark=false)=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:hgt,deviceScaleFactor:1,mobile});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'}]})};
 const go=async(u,wait=1800)=>{await send('Page.navigate',{url:u});await sleep(wait)};
 const js=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)console.log('EVAL ERROR',e.slice(0,80),r.result.exceptionDetails.exception?.description);return r.result?.result?.value};
 const shot=async(name,full=false)=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:full});fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.result.data,'base64'));console.log('saved',name)};
 const click=async(sel,wait=500)=>{const ok=await js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.click();return true})()`);if(!ok)console.log('MISSING',sel);await sleep(wait)};
 const overflow=async name=>{const w=await js('document.documentElement.scrollWidth>window.innerWidth?document.documentElement.scrollWidth:0');if(w)console.log('HORIZONTAL OVERFLOW on',name,w)};
 const login=async()=>{if(await js(`!!document.querySelector('form[data-form="login"]')`)){await js(`(()=>{const f=document.querySelector('form[data-form="login"]');f.email.value=${JSON.stringify(EMAIL)};f.password.value=${JSON.stringify(PASS)};f.requestSubmit()})()`);await sleep(1800)}};
 const staff=async(v,wait=1600)=>{if(!await js(`location.origin===${JSON.stringify(B)}`))await go(B+'/staff',800);await js(`localStorage.setItem('aps-order-staff-view',JSON.stringify(${JSON.stringify(v)}))`);await go(B+'/staff',wait);await login()};

 if(want('customer')){
  await size(390,844,true);
  await go(B+'/');await shot('c1-landing');await overflow('landing');
  await go(B+'/r/dar-zellige/?table='+TOK);await js('sessionStorage.clear()');await go(B+'/r/dar-zellige/?table='+TOK);await shot('c2-picker');await overflow('picker');
  await click('[data-lang="fr"]',800);await shot('c3-menu-top');await overflow('menu');
  await click('[data-inc="4"]');await click('[data-inc="4"]');await click('[data-inc="5"]');
  await js('window.scrollTo(0,700)');await sleep(500);await shot('c4-menu-scrolled');
  await click('[data-action="languages"]');await shot('c5-language-sheet');await click('[data-lang="de"]',800);await shot('c6-german');
  await click('[data-action="languages"]');await click('[data-lang="zh"]',800);await shot('c7-chinese');
  await click('[data-action="languages"]');await click('[data-lang="ar"]',800);await shot('c8-arabic');await overflow('arabic');
  await click('[data-action="languages"]');await click('[data-lang="fr"]',600);
  await click('[data-action="cart"]');await js(`document.querySelector('#checkout').requestSubmit()`);await sleep(1500);await shot('c9-tracking',true);
  await size(390,844,true,true);await go(B+'/r/dar-zellige/?table='+TOK);await shot('c10-dark');
  await size(1280,860,false);await go(B+'/r/dar-zellige/?table='+TOK);await shot('c11-desktop');
  await size(390,844,true);await go(B+'/r/unknown');await shot('c12-notfound');
 }
 if(want('staff')){
  await size(1440,900,false);
  await go(B+'/staff',800);await js(`localStorage.clear()`);await go(B+'/staff',1500);await shot('s0-login');await login();
  await staff('orders',2200);await shot('s1-board');await overflow('board');
  await click('[data-view="menu"]');await click('[data-item="4"]');await js(`document.querySelector('details.more-langs').open=true`);await sleep(300);await shot('s2-item-form');await js(`document.querySelector('#modal').close()`);
  await click('[data-view="analytics"]',900);await shot('s3-analytics',true);
  await size(390,844,true);await staff('orders',2200);await shot('s4-board-mobile');await overflow('board-mobile');
  await size(1440,900,false,true);await staff('orders',2200);await shot('s5-board-dark');
  await size(1440,900,false);await js(`localStorage.setItem('aps-order-staff-lang','"ar"')`);await staff('orders',2000);await shot('s6-board-arabic');await overflow('board-ar');
  await js(`localStorage.setItem('aps-order-staff-lang','"zh"')`);await staff('reception',2000);await shot('s7-reception-chinese');
  await js(`localStorage.setItem('aps-order-staff-lang','"fr"')`);
 }
 if(want('take')){
  await size(1440,900,false);await staff('reception',600);await js(`localStorage.removeItem('aps-order-take')`);await staff('reception',2000);
  await click('[data-take-add="3"]');await click('[data-take-add="3"]');await click('[data-take-add="5"]');await click('[data-take-type="takeaway"]');await shot('t1-reception');
  await click('[data-action="take-send"]',1800);await shot('t2-reception-sent');await js(`document.querySelector('#modal').close()`);
  await click('[data-action="saver-settings"]');await click('[data-action="saver-test"]',1000);await shot('t3-saver');await click('#saver',600);
  await size(390,844,true);await staff('waiter',2000);await shot('t4-waiter-tables');await overflow('waiter');
  await click('[data-take-start="table"][data-id="2"]',700);await click('[data-take-add="1"]');await click('[data-take-add="4"]');await shot('t5-waiter-menu');await overflow('waiter-menu');
  await click('[data-action="take-review"]',600);await shot('t6-waiter-ticket');
  await click('[data-action="take-send"]',1800);await shot('t7-waiter-after');
  await size(1440,900,false);await staff('orders',2000);await shot('t8-board-with-waiter');
 }
 if(want('screens')){
  await size(1440,900,false);await staff('screens',2000);
  if(!await js(`!!document.querySelector('[data-screen-pin]')`)){await click('[data-action="screen-new"]');await js(`(()=>{const f=document.querySelector('form[data-form="screen-save"]');f.name.value='Écran entrée';f.requestSubmit()})()`);await sleep(1500)}
  await shot('x1-screens');await click('[data-action="media-new"]');await shot('x2-upload');await js(`document.querySelector('#modal').close()`);
  await staff('venue',1800);await shot('x3-venue');
 }
 if(want('player')){
  await size(1280,720,false);await go(B+'/screen',1500);await js('localStorage.clear()');await go(B+'/screen',1500);await shot('p1-pair');
  const pin=process.env.PIN;if(pin){await js(`(()=>{document.querySelector('#pin').value=${JSON.stringify(pin)};document.querySelector('#pair').requestSubmit()})()`);await sleep(3500);await shot('p2-playing');await sleep(11000);await shot('p3-next')}
 }
 if(want('rating')&&process.env.ORDER){
  // ORDER=<public_id>.<status_token> of an order already served and paid (see README)
  await size(390,844,true);await go(B+'/',600);await js('localStorage.clear();sessionStorage.clear()');
  await go(B+'/r/dar-zellige/#o='+process.env.ORDER,1800);await shot('r1-picker-from-reception-qr');await click('[data-lang="en"]',1500);await shot('r2-rate-prompt',true);
  await click('[data-star="4"]',300);await js(`document.querySelector('#rate-form textarea').value='Great tagine, a bit slow'`);await shot('r3-rate-filled');
  await js(`document.querySelector('#rate-form').requestSubmit()`);await sleep(1200);await shot('r4-rate-thanks');
 }
 console.log('JS ERRORS:',errors.length?errors:'none');
 ws.close();ch.kill();process.exit(0);
})();
