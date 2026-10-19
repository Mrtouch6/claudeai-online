'use strict';
/* APS Order · TV player. Paired once with a 6-digit code, then loops the restaurant's playlist full screen.
   The device token stays in localStorage; the playlist and its media are kept so the loop survives a network cut. */
const $=s=>document.querySelector(s),app=$('#app');
const TOKEN='aps-screen-token',LIST='aps-screen-playlist',CACHE='aps-signage-v1';
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}},set(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=store.get(TOKEN,''),data=store.get(LIST,null),idx=-1,slideTimer=null,pollTimer=null,clockTimer=null,online=true,wakeLock=null,sig='';
const blobs=new Map();

async function api(action,payload,headers={}){
 const r=await fetch('/api.php?action='+action,{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:payload?{'Content-Type':'application/json',...headers}:headers,body:payload?JSON.stringify(payload):undefined});
 let x;try{x=await r.json()}catch{throw new Error('unavailable')}if(!r.ok||!x.ok){const e=new Error(x.error||'unavailable');e.status=r.status;throw e}return x;
}

/* ---------- Pairing ---------- */
function renderPair(err=''){
 clearTimeout(slideTimer);clearTimeout(pollTimer);clearInterval(clockTimer);document.body.classList.remove('idle-cursor');
 app.innerHTML=`<main class="pair"><form class="pair-card" id="pair"><span class="mark">APS<i>.</i> ORDER</span><h1>Appairer cet écran</h1><p>Saisissez le code à 6 chiffres affiché dans l’espace équipe, rubrique « Écrans ».<small>Enter the 6-digit code shown in the team workspace under “Screens”. · أدخل الرمز المكون من 6 أرقام</small></p><input class="pin-input" id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" aria-label="Code" autofocus><div class="keypad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-k="${n}">${n}</button>`).join('')}<button type="button" data-k="del" aria-label="Effacer">⌫</button><button type="button" data-k="0">0</button><button class="ok" type="submit" aria-label="Valider">OK</button></div><p class="err" role="alert">${h(err)}</p></form></main>`;
 $('#pin').focus();
}
document.addEventListener('click',e=>{const k=e.target.closest('[data-k]');if(!k)return;const p=$('#pin');if(!p)return;p.value=k.dataset.k==='del'?p.value.slice(0,-1):(p.value+k.dataset.k).replace(/\D/g,'').slice(0,6);p.focus()});
document.addEventListener('input',e=>{if(e.target.id==='pin')e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='pair')return;e.preventDefault();const pin=$('#pin').value;if(!/^\d{6}$/.test(pin))return renderPair('Le code contient 6 chiffres. / The code has 6 digits.');
 const b=e.target.querySelector('.ok');b.disabled=true;
 try{
  const s=await api('session');const x=await api('screen-pair',{pin},{'X-CSRF-Token':s.csrf});token=x.token;store.set(TOKEN,token);
  try{await document.documentElement.requestFullscreen?.()}catch{}start();
 }catch(err){renderPair(err.message==='pin'?'Code incorrect ou expiré. / Wrong or expired code.':err.message==='rate'?'Trop d’essais. Réessayez dans 15 minutes. / Too many attempts, wait 15 minutes.':'Pas de connexion au serveur. / Cannot reach the server.')}
});

/* ---------- Media cache: everything in the playlist is stored locally, then played from a blob URL ---------- */
const hasCache='caches'in window;
async function prefetch(items){
 if(!hasCache)return;
 try{
  const c=await caches.open(CACHE),want=new Set(items.map(i=>i.path));
  for(const i of items)if(!await c.match(i.path)){try{const r=await fetch(i.path,{cache:'no-store'});if(r.ok&&r.status===200)await c.put(i.path,r)}catch{}}
  for(const req of await c.keys()){const p=new URL(req.url).pathname;if(!want.has(p)){await c.delete(req);if(blobs.has(p)){URL.revokeObjectURL(blobs.get(p));blobs.delete(p)}}}
 }catch{}
}
async function src(item){
 if(!hasCache)return item.path;
 if(blobs.has(item.path))return blobs.get(item.path);
 try{const r=await (await caches.open(CACHE)).match(item.path);if(r){const u=URL.createObjectURL(await r.blob());
  // Keep images in memory (small); videos are re-read from the cache each time to spare RAM on TV sticks.
  if(item.kind==='image')blobs.set(item.path,u);return u}}catch{}
 return item.path;
}

/* ---------- Playback ---------- */
function stage(){let s=$('.stage');if(!s){app.innerHTML='<div class="stage"></div>';s=$('.stage')}return s}
function renderIdle(){
 clearTimeout(slideTimer);const r=data?.restaurant||{};
 app.innerHTML=`<div class="idle">${r.logo_path?`<img src="${h(r.logo_path)}" alt="">`:''}<h1>${h(r.name||'APS Order')}</h1><div class="clock" id="clock"></div><small>${h(data?.screen?.name||'')}</small></div>`;
 const tick=()=>{const c=$('#clock');if(c)c.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};tick();clearInterval(clockTimer);clockTimer=setInterval(tick,10000);netDot();
}
async function next(){
 clearTimeout(slideTimer);clearInterval(clockTimer);const items=data?.items||[];
 if(!items.length)return renderIdle();
 idx=(idx+1)%items.length;const item=items[idx],url=await src(item),s=stage(),old=[...s.querySelectorAll('.slide')];
 const el=document.createElement('div');el.className='slide';
 const done=()=>{if(item.kind==='video'&&url.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(url),2000);next()};
 if(item.kind==='video'){
  const v=document.createElement('video');v.muted=true;v.playsInline=true;v.autoplay=true;v.preload='auto';v.src=url;
  if(items.length===1){v.loop=true}else{v.onended=done;slideTimer=setTimeout(done,15*60000)}
  v.onerror=()=>{clearTimeout(slideTimer);slideTimer=setTimeout(done,1500)};el.appendChild(v);v.play?.().catch(()=>{});
 }else{
  const img=new Image();img.alt='';img.src=url;img.onerror=()=>{clearTimeout(slideTimer);slideTimer=setTimeout(next,1500)};el.appendChild(img);
  if(items.length>1)slideTimer=setTimeout(next,Math.max(3,+item.duration||10)*1000);
 }
 s.appendChild(el);requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('on')));
 setTimeout(()=>old.forEach(o=>{o.querySelector('video')?.pause();o.remove()}),900);netDot();
}
function netDot(){let d=$('.net');if(online){d?.remove();return}if(!d){d=document.createElement('span');d.className='net';d.title='Hors ligne / Offline';document.body.appendChild(d)}}

async function poll(){
 clearTimeout(pollTimer);
 try{
  const x=await api('screen-playlist',undefined,{'X-Screen-Token':token});online=true;
  const nsig=JSON.stringify([x.items,x.restaurant]);
  if(nsig!==sig){await prefetch(x.items);data=x;store.set(LIST,x);sig=nsig;idx=-1;next()}
  pollTimer=setTimeout(poll,Math.max(30,+x.poll||60)*1000);
 }catch(e){
  if(e.status===401){store.set(TOKEN,null);store.set(LIST,null);token='';data=null;sig='';return renderPair('Cet écran a été déconnecté. Saisissez un nouveau code. / This screen was unpaired.')}
  online=false;netDot();pollTimer=setTimeout(poll,60000);
 }
 netDot();
}
function start(){
 // Start from the last known playlist straight away (works offline), then refresh it.
 if(data&&!sig){sig=JSON.stringify([data.items,data.restaurant]);idx=-1;next()}else if(!data)app.innerHTML='<main class="boot"><span class="mark">APS<i>.</i> ORDER</span></main>';
 poll();wake();
}
async function wake(){try{if('wakeLock'in navigator&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>wakeLock=null)}}catch{}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token){wake();poll()}});
// Browsers only allow full screen after a gesture: the first touch or remote key press enables it.
let cursorTimer=null;document.addEventListener('pointermove',()=>{document.body.classList.remove('idle-cursor');clearTimeout(cursorTimer);if(token)cursorTimer=setTimeout(()=>document.body.classList.add('idle-cursor'),3000)});
['click','keydown'].forEach(ev=>document.addEventListener(ev,()=>{if(token&&!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{})}));
if('serviceWorker'in navigator)navigator.serviceWorker.register('/screen-sw.js',{scope:'/screen'}).catch(()=>{});
token?start():renderPair();
