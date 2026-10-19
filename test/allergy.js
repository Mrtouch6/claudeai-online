const {spawn}=require('child_process'),fs=require('fs'),path=require('path'),os=require('os');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const prof=fs.mkdtempSync(path.join(os.tmpdir(),'apsprof-'));
const ch=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--remote-debugging-port=9334','--user-data-dir='+prof,'about:blank'],{stdio:'ignore'});
for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:9334/json/version');break}catch{await sleep(250)}}
const tgt=await (await fetch('http://127.0.0.1:9334/json/new?about:blank',{method:'PUT'})).json();const ws=new WebSocket(tgt.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pend={};ws.onmessage=m=>{const x=JSON.parse(m.data);if(x.id&&pend[x.id]){pend[x.id](x);delete pend[x.id]}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const js=async e=>(await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await send('Page.navigate',{url:'http://127.0.0.1:4190/r/dar-zellige/?table=tok4a1b2c3d4e5f6a7b8c9d0e1f2'});await sleep(1800);
await js(`document.querySelector('[data-action="allergies"]').click()`);await sleep(400);await js(`document.querySelector('#allergy-form input[value="nuts"]').click()`);await js(`document.querySelector('#allergy-form').requestSubmit()`);await sleep(500);await js(`document.querySelector('[data-dish="6"]').click()`);await sleep(400);
console.log(await js(`JSON.stringify({ls:localStorage.getItem("aps-order-allergies"),chip:document.querySelector("[data-action=allergies]").textContent,warnTags:[...document.querySelectorAll("#sheet .tag.warn")].map(t=>t.textContent)})`));
ws.close();ch.kill();process.exit(0)})();
