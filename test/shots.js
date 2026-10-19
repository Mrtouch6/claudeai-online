// Drives headless Chrome over the DevTools protocol (Node's built-in WebSocket) and saves screenshots.
const {spawn}=require('child_process'),fs=require('fs'),path=require('path'),os=require('os');
const CHROME='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT=path.join(__dirname,'shots');fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const B='http://127.0.0.1:4190';
const TOK='tok4a1b2c3d4e5f6a7b8c9d0e1f2';
const scenario=process.argv[2]||'all';
(async()=>{
 const prof=fs.mkdtempSync(path.join(os.tmpdir(),'apsprof-'));
 const ch=spawn(CHROME,['--headless=new','--remote-debugging-port=9333','--user-data-dir='+prof,'--no-first-run','--hide-scrollbars','about:blank'],{stdio:'ignore'});
 let ver;for(let i=0;i<40;i++){try{ver=await (await fetch('http://127.0.0.1:9333/json/version')).json();break}catch{await sleep(250)}}
 const tgt=await (await fetch('http://127.0.0.1:9333/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pend={},errors=[];
 ws.onmessage=m=>{const x=JSON.parse(m.data);if(x.id&&pend[x.id]){pend[x.id](x);delete pend[x.id]}if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.exception?.description||x.params.exceptionDetails.text);if(x.method==='Runtime.consoleAPICalled'&&x.params.type==='error')errors.push(x.params.args.map(a=>a.value||a.description).join(' '))};
 const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
 await send('Runtime.enable');await send('Page.enable');
 const size=async(w,hgt,mobile,dark=false)=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:hgt,deviceScaleFactor:1,mobile});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'}]})};
 const go=async(u,wait=1800)=>{await send('Page.navigate',{url:u});await sleep(wait)};
 const js=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});return r.result?.result?.value};
 const shot=async(name,full=false)=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:full});fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.result.data,'base64'));console.log('saved',name)};
 const click=async sel=>{const ok=await js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.click();return true})()`);if(!ok)console.log('MISSING',sel);await sleep(500)};
 const overflow=async name=>{const w=await js('document.documentElement.scrollWidth>window.innerWidth?document.documentElement.scrollWidth:0');if(w)console.log('HORIZONTAL OVERFLOW on',name,w)};

 if(scenario==='all'||scenario==='customer'){
  await size(390,844,true);
  await go(B+'/');await shot('c1-landing');await overflow('landing');
  await go(B+'/r/dar-zellige/?table='+TOK);await shot('c2-menu-top');await overflow('menu');
  await click('[data-inc="4"]');await click('[data-inc="4"]');await click('[data-inc="11"]');
  await js('window.scrollTo(0,900)');await sleep(500);await shot('c3-menu-scrolled');
  await click('[data-action="allergies"]');await js(`document.querySelector('#allergy-form input[value="nuts"]').click()`);await shot('c4-allergies');
  await js(`document.querySelector('#allergy-form').requestSubmit()`);await sleep(500);
  await click('[data-dish="6"]');await shot('c5-detail');await click('[data-action="close"]');
  await click('[data-action="cart"]');await shot('c6-cart');
  await js(`document.querySelector('.sheet').scrollTo(0,9999)`);await sleep(300);await shot('c7-cart-bottom');
  await js(`document.querySelector('#checkout').requestSubmit()`);await sleep(1500);await shot('c8-tracking',true);await overflow('tracking');
  await click('[data-action="menu"]');await sleep(800);await shot('c9-menu-live-chip');
  await click('[data-lang="ar"]');await sleep(500);await shot('c10-arabic');
  await click('[data-lang="fr"]');
  await size(390,844,true,true);await go(B+'/r/dar-zellige/?table='+TOK);await shot('c11-dark');
  await size(1280,860,false);await go(B+'/r/dar-zellige/?table='+TOK);await shot('c12-desktop');
  await go(B+'/r/unknown');await shot('c13-notfound');
 }
 if(scenario==='all'||scenario==='staff'){
  await size(1440,900,false);
  await go(B+'/staff?loggedout',1500);await shot('s0-login');
  await go(B+'/staff',2200);await shot('s1-board');await overflow('board');
  await click('.ticket .flag.allergy');await sleep(600);await shot('s2-order-detail');
  await js(`document.querySelector('#modal').close()`);await sleep(300);
  await click('[data-advance]');await sleep(600);await shot('s3-board-after-advance');
  await click('[data-view="menu"]');await shot('s4-menu');
  await click('[data-item="6"]');await shot('s5-item-form');await js(`document.querySelector('#modal').close()`);
  await click('[data-view="tables"]');await shot('s6-tables');
  await click('[data-view="analytics"]');await shot('s7-analytics');
  await click('[data-view="team"]');await shot('s8-team');
  await size(390,844,true);await go(B+'/staff',2200);await shot('s9-board-mobile');await overflow('board-mobile');
  await size(1440,900,false,true);await go(B+'/staff',2200);await shot('s10-board-dark');
 }
 console.log('JS ERRORS:',errors.length?errors:'none');
 ws.close();ch.kill();process.exit(0);
})();
