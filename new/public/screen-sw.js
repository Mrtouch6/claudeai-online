// Keeps the TV player able to start without a connection: network first, cached copy as fallback.
const SHELL='aps-screen-shell-20261020',FILES=['/screen','/assets/screen.js?v=20261020','/assets/screen.css?v=20261020'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n.startsWith('aps-screen-shell-')&&n!==SHELL).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 const key=e.request.mode==='navigate'&&/^\/screen\/?$/.test(u.pathname)?'/screen':FILES.includes(u.pathname+u.search)?u.pathname+u.search:null;if(!key)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(SHELL).then(x=>x.put(key,c))}return r}).catch(()=>caches.match(key)));
});
