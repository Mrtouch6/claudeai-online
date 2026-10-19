'use strict';
const $=s=>document.querySelector(s);
const app=$('#app'),sheet=$('#sheet'),sheetBody=$('#sheet-body'),toastEl=$('#toast');
const store={
 get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}},
 set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
};
const ALLERGENS={gluten:['Gluten','Gluten','الغلوتين'],crustaceans:['Crustacés','Crustaceans','القشريات'],eggs:['Œufs','Eggs','البيض'],fish:['Poisson','Fish','السمك'],peanuts:['Arachides','Peanuts','الفول السوداني'],soy:['Soja','Soy','الصويا'],milk:['Lait','Milk','الحليب'],nuts:['Fruits à coque','Nuts','المكسرات'],celery:['Céleri','Celery','الكرفس'],mustard:['Moutarde','Mustard','الخردل'],sesame:['Sésame','Sesame','السمسم'],sulphites:['Sulfites','Sulphites','الكبريتيت'],lupin:['Lupin','Lupin','الترمس'],molluscs:['Mollusques','Molluscs','الرخويات']};
const STEPS=['new','confirmed','preparing','ready','served'];
const FINAL=['served','cancelled'];
const ORDER_TTL=12*3600*1000;

let csrf='',data=null,lang=store.get('aps-order-lang',null),cart=[],orders=[],view='menu',current=null,query='',pollTimer=null,lastSync=0,personal=false,people=2;
let allergyFilter=store.get('aps-order-allergies',[]).filter(a=>ALLERGENS[a]),hideConflicts=!!store.get('aps-order-hide',false);
const callCooldown={};

const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=(fr,en,ar)=>lang==='ar'?(ar||fr):lang==='en'?(en||fr):fr;
const locale=()=>lang==='ar'?'ar-MA':lang==='en'?'en-GB':'fr-MA';
const money=(n,c)=>new Intl.NumberFormat(locale(),{style:'currency',currency:c||data?.restaurant?.currency||'MAD'}).format((+n||0)/100);
const svg=p=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I={
 plus:svg('<path d="M12 5v14M5 12h14"/>'),minus:svg('<path d="M5 12h14"/>'),x:svg('<path d="M6 6l12 12M18 6 6 18"/>'),
 search:svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),bell:svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
 receipt:svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),check:svg('<path d="m5 12 5 5 9-10"/>'),
 shield:svg('<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/><path d="M9 12h6"/>'),bag:svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
 back:svg('<path d="M15 6l-6 6 6 6"/>'),qr:svg('<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>'),
 dish:svg('<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 7V5"/>'),spark:svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>')
};
const ERR={validation:['Vérifiez les informations.','Check the information.','تحقق من المعلومات.'],orders_closed:['Le restaurant ne prend pas de commandes en ce moment.','The restaurant is not taking orders right now.','المطعم لا يستقبل الطلبات حاليًا.'],unavailable_item:['Un plat de votre panier n’est plus disponible. Retirez-le puis réessayez.','A dish in your basket is no longer available. Remove it and try again.','أحد الأطباق لم يعد متاحًا. احذفه وحاول مجددًا.'],table:['Ce QR code de table n’est plus valide. Demandez-en un nouveau à l’équipe.','This table QR code is no longer valid. Ask the staff for a new one.','رمز الطاولة لم يعد صالحًا. اطلب رمزًا جديدًا من الطاقم.'],rate:['Trop de demandes. Réessayez dans quelques minutes.','Too many requests. Try again in a few minutes.','طلبات كثيرة. حاول بعد دقائق.'],not_found:['Ce menu n’est pas disponible.','This menu is not available.','هذه القائمة غير متاحة.'],csrf:['La page a expiré. Rechargez-la.','This page expired. Reload it.','انتهت صلاحية الصفحة. أعد تحميلها.'],offline:['Pas de connexion. Vérifiez le Wi-Fi puis réessayez.','No connection. Check the Wi-Fi and try again.','لا يوجد اتصال. تحقق من الشبكة وحاول مجددًا.'],unavailable:['Service momentanément indisponible. Réessayez dans un instant.','Service temporarily unavailable. Try again in a moment.','الخدمة غير متاحة مؤقتًا. حاول بعد قليل.']};
const msg=e=>tr(...(ERR[e]||ERR.unavailable));
function toast(s,bad=false){toastEl.textContent=s;toastEl.className='toast'+(bad?' bad':'');toastEl.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>toastEl.hidden=true,4500)}

async function api(action,payload,query=''){
 let r;try{r=await fetch('/api.php?action='+encodeURIComponent(action)+query,{method:payload===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:payload===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:payload===undefined?undefined:JSON.stringify(payload)})}catch{throw new Error('offline')}
 let x;try{x=await r.json()}catch{throw new Error('unavailable')}
 if(x.csrf)csrf=x.csrf;if(!r.ok||!x.ok)throw new Error(x.error||'unavailable');return x;
}
function pathInfo(){const m=location.pathname.match(/^\/r\/([a-z0-9-]+)/);return{slug:m?.[1]||'',table:new URLSearchParams(location.search).get('table')||''}}
const P=pathInfo();
const cartKey='aps-cart:'+P.slug+':'+P.table,ordersKey='aps-orders:'+P.slug;
const saveCart=()=>store.set(cartKey,cart);
function loadOrders(){const now=Date.now();orders=store.get(ordersKey,[]).filter(o=>o&&o.id&&o.token&&now-o.at<ORDER_TTL);store.set(ordersKey,orders.map(({id,token,at})=>({id,token,at})))}
const saveOrders=()=>store.set(ordersKey,orders.map(({id,token,at})=>({id,token,at})));

const names=x=>tr(x.name_fr,x.name_en,x.name_ar);
const desc=x=>tr(x.description_fr,x.description_en,x.description_ar);
function allergensOf(i){try{const a=JSON.parse(i.allergens||'[]');return Array.isArray(a)?a.filter(x=>ALLERGENS[x]):[]}catch{return[]}}
const conflict=i=>allergensOf(i).some(a=>allergyFilter.includes(a));
const item=id=>data.items.find(i=>i.id==id);
const open=()=>!!+data.restaurant.accepting_orders;
const canOrder=i=>open()&&!!+i.available;
const qtyOf=id=>cart.filter(l=>l.item_id==id).reduce((n,l)=>n+l.quantity,0);
const count=()=>cart.reduce((n,l)=>n+l.quantity,0);
function totals(){const sub=cart.reduce((s,l)=>s+(+(item(l.item_id)?.price||0))*l.quantity,0),r=data.restaurant;const tax=Math.floor((sub*r.tax_rate+5000)/10000),service=Math.floor((sub*r.service_rate+5000)/10000);return{sub,tax,service,total:sub+tax+service}}
function setLangAttrs(){document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr'}
const langSwitch=()=>`<div class="langs" role="group" aria-label="Langue / Language">${['fr','en','ar'].map(x=>`<button data-lang="${x}" aria-pressed="${lang===x}">${x==='ar'?'ع':x.toUpperCase()}</button>`).join('')}</div>`;
const topbar=()=>`<header class="topbar"><div class="wrap"><span class="mark">APS<i>.</i> ORDER</span>${langSwitch()}</div></header>`;
const statusLabel=s=>({new:tr('Commande reçue','Order received','تم استلام الطلب'),confirmed:tr('Confirmée','Confirmed','تم التأكيد'),preparing:tr('En préparation','Being prepared','قيد التحضير'),ready:tr('Prête','Ready','جاهز'),served:tr('Servie · bon appétit','Served · enjoy','تم التقديم · بالهناء'),cancelled:tr('Annulée','Cancelled','ملغي')}[s]||s);

/* ---------- Landing (no restaurant in the link) ---------- */
function renderLanding(){
 setLangAttrs();document.title='APS Order';
 app.innerHTML=`<div class="landing">${topbar()}<div><section class="landing-hero pattern"><div class="wrap"><span class="eyebrow">${tr('Commande à table','Order at your table','الطلب من الطاولة')}</span><h1>${tr('Scannez. Choisissez. On s’occupe du reste.','Scan. Choose. We handle the rest.','امسح. اختر. ونحن نتكفل بالباقي.')}</h1><p>${tr('Pour voir le menu, scannez le QR code posé sur votre table avec l’appareil photo de votre téléphone.','To see the menu, scan the QR code on your table with your phone camera.','لعرض القائمة، امسح رمز QR الموجود على طاولتك بكاميرا هاتفك.')}</p></div></section>
 <main id="main" class="wrap"><div class="how"><div><span class="n">1</span><strong>${tr('Scannez','Scan','امسح')}</strong><span>${tr('Le QR code de votre table ouvre son menu.','Your table’s QR code opens its menu.','رمز طاولتك يفتح قائمتها.')}</span></div><div><span class="n">2</span><strong>${tr('Commandez','Order','اطلب')}</strong><span>${tr('En français, anglais ou arabe, avec vos allergies signalées.','In French, English or Arabic, with your allergies flagged.','بالفرنسية أو الإنجليزية أو العربية مع الإشارة إلى الحساسية.')}</span></div><div><span class="n">3</span><strong>${tr('Suivez','Follow','تابع')}</strong><span>${tr('Votre commande s’actualise en direct jusqu’au service.','Your order updates live until it is served.','يتم تحديث طلبك مباشرة حتى التقديم.')}</span></div></div>
 ${orders.length?`<button class="primary" data-action="track">${I.receipt} ${tr('Suivre ma commande','Track my order','تتبع طلبي')}</button>`:''}</main></div>
 <footer class="wrap landing-foot"><span>APS Order · Rabat</span><span>${tr('Restaurateur ?','Restaurant owner?','صاحب مطعم؟')} <a href="/staff">${tr('Espace équipe','Team workspace','مساحة الفريق')} →</a> · contact@apservices.vip</span></footer></div>`;
}
function renderError(code){
 setLangAttrs();
 app.innerHTML=`${topbar()}<main id="main" class="wrap"><div class="empty" style="min-height:60vh;align-content:center">${I.qr}<strong>${h(msg(code))}</strong><p>${code==='not_found'?tr('Le lien a peut-être changé. Demandez à l’équipe de vous montrer le QR code de la table.','The link may have changed. Ask the staff to show you the table’s QR code.','ربما تغيّر الرابط. اطلب من الطاقم رمز الطاولة.'):tr('Vérifiez votre connexion puis réessayez.','Check your connection and try again.','تحقق من اتصالك وحاول مجددًا.')}</p><button class="secondary" style="width:auto" data-action="reload">${tr('Réessayer','Try again','حاول مجددًا')}</button></div></main>`;
}

/* ---------- Menu ---------- */
function renderMenu(){
 view='menu';setLangAttrs();const r=data.restaurant,t=data.table;document.title=r.name+' · APS Order';
 const cats=data.categories.filter(c=>data.items.some(i=>i.category_id==c.id));
 app.innerHTML=`${topbar()}<section class="hero pattern"><div class="wrap">
  <span class="eyebrow">${tr('Menu & commande','Menu & ordering','القائمة والطلب')}</span>
  <h1>${h(r.name)}</h1>
  <div class="hero-meta">${t?`<span class="pill table">${tr('Table','Table','طاولة')} ${h(t.label)}${t.zone?' · '+h(t.zone):''}</span>`:''}<span class="pill ${open()?'':'closed'}"><span class="dot"></span>${open()?tr('Commandes ouvertes','Taking orders','نستقبل الطلبات'):tr('Commandes fermées','Not taking orders','الطلبات مغلقة')}</span></div>
  ${t?`<div class="hero-actions"><button class="ghost" data-call="waiter">${I.bell}${tr('Appeler un serveur','Call a waiter','نداء النادل')}</button><button class="ghost" data-call="bill">${I.receipt}${tr('Demander l’addition','Ask for the bill','طلب الفاتورة')}</button></div>`:''}
 </div></section>
 <div class="tools"><div class="wrap"><div class="tool-row"><label class="search">${I.search}<input id="menu-search" type="search" value="${h(query)}" placeholder="${tr('Rechercher un plat…','Search dishes…','ابحث عن طبق…')}" aria-label="${tr('Rechercher un plat','Search dishes','ابحث عن طبق')}" autocomplete="off"></label><button class="chip-btn ${allergyFilter.length?'on':''}" data-action="allergies">${I.shield}${tr('Allergies','Allergies','الحساسية')}${allergyFilter.length?' · '+allergyFilter.length:''}</button></div>
 ${cats.length>1?`<nav class="cats" id="cats" aria-label="${tr('Catégories','Categories','الفئات')}">${cats.map((c,i)=>`<button data-cat="${c.id}" aria-current="${i===0}">${h(names(c))}</button>`).join('')}</nav>`:'<div style="height:2px"></div>'}</div></div>
 <main id="main" class="wrap menu"><div id="menu-list" class="menu" style="padding:0"></div>
 <footer class="foot"><p>${tr('Prix en','Prices in','الأسعار بـ')} ${h(r.currency)}${+r.tax_rate?' · '+tr('taxe','tax','ضريبة')+' '+(r.tax_rate/100)+'%':''}${+r.service_rate?' · '+tr('service','service','خدمة')+' '+(r.service_rate/100)+'%':''}</p><p>${tr('Signalez toujours vos allergies à l’équipe, y compris pour les traces.','Always tell the staff about allergies, including traces.','أخبر الطاقم دائمًا بالحساسية، بما في ذلك الآثار.')}</p><p>APS<span style="color:var(--saffron)">.</span> Order</p></footer></main>
 <div class="dock" id="dock"><div class="wrap" id="dock-inner"></div></div>`;
 renderList();renderDock();spy();
}
function media(i,cls=''){return i.image_path?`<img class="${cls}" src="${h(i.image_path)}" alt="" loading="lazy">`:`<div class="mono pattern ${cls}" aria-hidden="true">${h((names(i).trim()[0]||'·').toUpperCase())}</div>`}
function control(i){
 const label=h(names(i));
 if(!canOrder(i))return`<button class="add" disabled aria-label="${tr('Indisponible','Unavailable','غير متاح')}">${I.plus}</button>`;
 const q=qtyOf(i.id);
 return q?`<div class="stepper"><button data-dec="${i.id}" aria-label="${tr('Retirer','Remove','إزالة')} ${label}">${I.minus}</button><b>${q}</b><button data-inc="${i.id}" aria-label="${tr('Ajouter','Add','إضافة')} ${label}">${I.plus}</button></div>`:`<button class="add" data-inc="${i.id}" aria-label="${tr('Ajouter','Add','إضافة')} ${label}">${I.plus}</button>`;
}
function tags(i,all=false){const a=allergensOf(i);const shown=all?a:a.slice(0,3);return`${+i.featured?`<span class="tag star">${tr('Recommandé','Recommended','موصى به')}</span>`:''}${!+i.available?`<span class="tag">${tr('Épuisé','Sold out','نفد')}</span>`:''}${shown.map(x=>`<span class="tag ${allergyFilter.includes(x)?'warn':''}">${h(tr(...ALLERGENS[x]))}</span>`).join('')}${!all&&a.length>3?`<span class="tag">+${a.length-3}</span>`:''}`}
function dish(i){return`<article class="dish ${canOrder(i)?'':'off'}" data-dish="${i.id}"><div class="dish-body"><h3>${h(names(i))}</h3>${desc(i)?`<p>${h(desc(i))}</p>`:''}<div class="dish-foot"><span class="price">${money(i.price)}</span></div><div class="tags">${conflict(i)?`<span class="tag warn">⚠ ${tr('Contient un allergène signalé','Contains a flagged allergen','يحتوي على مسبب حساسية')}</span>`:''}${tags(i)}</div></div><div class="media">${media(i)}${control(i)}</div></article>`}
function visible(i){if(hideConflicts&&conflict(i))return false;if(!query)return true;const s=(names(i)+' '+desc(i)+' '+i.name_fr+' '+i.name_en+' '+i.name_ar).toLocaleLowerCase();return s.includes(query.toLocaleLowerCase())}
function renderList(){
 const list=$('#menu-list');if(!list)return;
 const cats=data.categories.filter(c=>data.items.some(i=>i.category_id==c.id));
 if(!cats.length){list.innerHTML=`<div class="empty">${I.dish}<strong>${tr('Le menu arrive bientôt','The menu is coming soon','القائمة قريبًا')}</strong><p>${tr('Le restaurant n’a pas encore publié ses plats.','The restaurant has not published its dishes yet.','لم ينشر المطعم أطباقه بعد.')}</p></div>`;return}
 const feats=!query?data.items.filter(i=>+i.featured&&canOrder(i)&&visible(i)):[];
 let html=open()?'':`<div class="closed-banner">${tr('Le restaurant ne prend pas de commandes numériques pour le moment. Vous pouvez consulter le menu et appeler un serveur.','The restaurant is not taking digital orders right now. You can browse the menu and call a waiter.','المطعم لا يستقبل الطلبات الرقمية حاليًا. يمكنك تصفح القائمة ونداء النادل.')}</div>`;
 if(feats.length>1)html+=`<section><h2 class="section-title">${tr('Recommandés','Recommended','موصى به')}</h2><div class="featured">${feats.map(i=>`<article class="feat" data-dish="${i.id}"><div class="media">${media(i)}${control(i)}</div><div class="feat-body"><h3>${h(names(i))}</h3><span class="price">${money(i.price)}</span></div></article>`).join('')}</div></section>`;
 let shown=0;
 for(const c of cats){const its=data.items.filter(i=>i.category_id==c.id&&visible(i));shown+=its.length;html+=`<section class="menu-section" data-section="${c.id}" ${its.length?'':'hidden'}><h2 class="section-title">${h(names(c))}<small>${its.length}</small></h2><div class="dishes">${its.map(dish).join('')}</div></section>`}
 if(!shown)html+=`<div class="empty">${I.search}<strong>${tr('Aucun plat trouvé','No dishes found','لا توجد أطباق')}</strong><p>${query?tr('Essayez un autre mot.','Try another word.','جرّب كلمة أخرى.'):tr('Vos filtres d’allergies masquent tous les plats.','Your allergy filters hide every dish.','فلاتر الحساسية تخفي كل الأطباق.')}</p></div>`;
 list.innerHTML=html;
}
function activeOrder(){return orders.find(o=>o.order&&!FINAL.includes(o.order.status))}
function renderDock(){
 const d=$('#dock-inner');if(!d)return;const live=activeOrder(),n=count();
 d.innerHTML=`${live?`<button class="live-chip" data-action="track" data-id="${h(live.id)}"><span class="dot"></span>${tr('Commande','Order','الطلب')} #${h(live.id)} · ${h(statusLabel(live.order.status))}</button>`:''}${n?`<button class="cart-bar" data-action="cart"><span>${I.bag} ${n} · ${tr('Voir la commande','View order','عرض الطلب')}</span><span class="total">${money(totals().total)}</span></button>`:''}`;
}
let spyObs=null;
function spy(){
 spyObs?.disconnect();const nav=$('#cats');if(!nav||!('IntersectionObserver'in window))return;
 spyObs=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){const id=e.target.dataset.section;nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.cat===id)));const b=nav.querySelector(`[data-cat="${id}"]`);if(b)nav.scrollTo({left:b.offsetLeft-nav.clientWidth/2+b.clientWidth/2,behavior:'smooth'})}},{rootMargin:'-170px 0px -65% 0px'});
 document.querySelectorAll('[data-section]').forEach(s=>spyObs.observe(s));
}
function refreshMenu(){renderList();renderDock();spy()}

/* ---------- Cart changes ---------- */
function addItem(id,qty=1,note=''){const i=item(id);if(!i||!canOrder(i))return;const key=id+'|'+note;const l=cart.find(x=>x.key===key);if(l)l.quantity=Math.min(20,l.quantity+qty);else cart.push({key,item_id:+id,quantity:qty,guest_name:'',note});saveCart()}
function removeOne(id){for(let n=cart.length-1;n>=0;n--)if(cart[n].item_id==id){cart[n].quantity--;if(cart[n].quantity<1)cart.splice(n,1);break}saveCart()}

/* ---------- Sheets ---------- */
function openSheet(title,body){sheetBody.innerHTML=`<div class="sheet-head"><h2>${title}</h2><button class="x" data-action="close" aria-label="${tr('Fermer','Close','إغلاق')}">${I.x}</button></div><div class="sheet-body">${body}</div>`;if(!sheet.open)sheet.showModal()}
function closeSheet(){if(sheet.open)sheet.close()}
sheet.addEventListener('click',e=>{if(e.target===sheet)closeSheet()});

function openDetail(id){
 const i=item(id);if(!i)return;let q=1;const ok=canOrder(i);
 const paint=()=>{const b=$('#detail-add');if(b)b.innerHTML=`${tr('Ajouter','Add','إضافة')} · ${money(i.price*q)}`;const n=$('#detail-q');if(n)n.textContent=q};
 openSheet(h(names(i)),`${i.image_path?`<img class="detail-photo" src="${h(i.image_path)}" alt="">`:`<div class="detail-photo mono pattern" aria-hidden="true">${h((names(i).trim()[0]||'·').toUpperCase())}</div>`}
  ${desc(i)?`<p>${h(desc(i))}</p>`:''}<div class="tags">${conflict(i)?`<span class="tag warn">⚠ ${tr('Contient un allergène signalé','Contains a flagged allergen','يحتوي على مسبب حساسية')}</span>`:''}${tags(i,true)||`<span class="tag">${tr('Aucun allergène déclaré','No declared allergens','لا توجد مسببات حساسية معلنة')}</span>`}</div>
  ${ok?`<div class="qty-row"><span class="price" style="font-size:20px">${money(i.price)}</span><div class="qty"><button type="button" data-q="-1" aria-label="−">${I.minus}</button><b id="detail-q" class="num">1</b><button type="button" data-q="1" aria-label="+">${I.plus}</button></div></div>
  <div class="field"><label for="detail-note">${tr('Préférence (facultatif)','Preference (optional)','تفضيل (اختياري)')}</label><input id="detail-note" maxlength="300" placeholder="${tr('Sans oignon, bien cuit…','No onion, well done…','بدون بصل، مطهو جيدًا…')}"></div>
  <button class="primary" id="detail-add" data-add-detail="${i.id}"></button>`:`<p class="notice">${!+i.available?tr('Ce plat est épuisé pour le moment.','This dish is sold out for now.','هذا الطبق غير متوفر حاليًا.'):tr('Les commandes sont fermées pour le moment.','Ordering is closed right now.','الطلبات مغلقة حاليًا.')}</p>`}`);
 paint();
 sheetBody.onclick=e=>{const b=e.target.closest('[data-q]');if(b){q=Math.max(1,Math.min(20,q+ +b.dataset.q));paint()}};
}
function openAllergies(back){
 openSheet(tr('Allergies','Allergies','الحساسية'),`<p class="notice">${tr('Cochez vos allergènes : les plats concernés seront signalés et vos allergies seront transmises avec la commande. Confirmez toujours avec l’équipe, notamment pour les traces.','Tick your allergens: matching dishes are flagged and your allergies are sent with the order. Always confirm with the staff, especially for traces.','حدد مسببات الحساسية: سيتم تمييز الأطباق المعنية وإرسالها مع الطلب. أكد دائمًا مع الطاقم.')}</p>
 <form id="allergy-form" data-back="${back?1:''}" style="display:grid;gap:14px"><div class="allergen-grid">${Object.entries(ALLERGENS).map(([k,v])=>`<label class="check"><input type="checkbox" name="a" value="${k}" ${allergyFilter.includes(k)?'checked':''}>${h(tr(...v))}</label>`).join('')}</div>
 <label class="switch">${tr('Masquer les plats concernés','Hide matching dishes','إخفاء الأطباق المعنية')}<input type="checkbox" name="hide" ${hideConflicts?'checked':''}></label>
 <button class="primary">${tr('Enregistrer','Save','حفظ')}</button></form>`);
}
function openCart(){
 if(!cart.length){closeSheet();refreshMenu();return}
 const r=data.restaurant,t=data.table,x=totals();
 const types=t?[['table',tr('À table','At the table','على الطاولة')],['takeaway',tr('À emporter','Takeaway','للأخذ')]]:[['counter',tr('Au comptoir','At the counter','عند المنضدة')],['takeaway',tr('À emporter','Takeaway','للأخذ')]];
 openSheet(tr('Votre commande','Your order','طلبك'),`
 <div id="cart-lines" class="${personal?'personal':''}">${cart.map((l,n)=>{const i=item(l.item_id);if(!i)return'';return`<div class="line"><div><strong>${h(names(i))}</strong><small>${money(i.price)}${l.note?' · '+h(l.note):''}</small></div><div class="qty"><button type="button" data-line="${n}" data-d="-1" aria-label="−">${I.minus}</button><b class="num">${l.quantity}</b><button type="button" data-line="${n}" data-d="1" aria-label="+">${I.plus}</button></div>${personal?`<div class="extra"><input data-field="guest_name" data-idx="${n}" value="${h(l.guest_name)}" maxlength="80" placeholder="${tr('Pour qui ? (prénom)','For whom? (name)','لمن؟ (الاسم)')}" aria-label="${tr('Prénom','Name','الاسم')}"><input data-field="note" data-idx="${n}" value="${h(l.note)}" maxlength="300" placeholder="${tr('Préférence','Preference','تفضيل')}" aria-label="${tr('Préférence','Preference','تفضيل')}"></div>`:''}</div>`}).join('')}</div>
 <label class="switch">${tr('Préciser un prénom ou une préférence par plat','Add a name or preference per dish','إضافة اسم أو تفضيل لكل طبق')}<input type="checkbox" data-action="personal" ${personal?'checked':''}></label>
 <form id="checkout" style="display:grid;gap:16px">
  <div class="field"><span class="label">${tr('Service','Service','الخدمة')}</span><div class="seg">${types.map((o,n)=>`<label><input type="radio" name="order_type" value="${o[0]}" ${n===0?'checked':''}><span>${o[1]}</span></label>`).join('')}</div></div>
  ${t?`<div class="field" id="pay-field"><span class="label">${tr('Paiement','Payment','الدفع')}</span><div class="seg"><label><input type="radio" name="payment_method" value="table" checked><span>${tr('À table','At the table','على الطاولة')}</span></label><label><input type="radio" name="payment_method" value="counter"><span>${tr('Au comptoir','At the counter','عند المنضدة')}</span></label></div></div>`:''}
  <div class="grid2"><div class="field"><label for="c-guests">${tr('Personnes','Guests','الأشخاص')}</label><select id="c-guests" name="guest_count">${Array.from({length:30},(_,i)=>`<option value="${i+1}" ${people===i+1?'selected':''}>${i+1}</option>`).join('')}</select></div><div class="field"><label for="c-name">${tr('Votre prénom (facultatif)','Your name (optional)','اسمك (اختياري)')}</label><input id="c-name" name="customer_name" maxlength="100" autocomplete="given-name"></div></div>
  <div class="field"><label for="c-note">${tr('Note pour la cuisine (facultatif)','Note for the kitchen (optional)','ملاحظة للمطبخ (اختياري)')}</label><textarea id="c-note" name="customer_note" maxlength="1000"></textarea></div>
  <div class="field"><span class="label">${tr('Allergies transmises','Allergies sent','الحساسية المرسلة')}</span><div class="tags" style="align-items:center">${allergyFilter.length?allergyFilter.map(a=>`<span class="tag warn">${h(tr(...ALLERGENS[a]))}</span>`).join(''):`<span class="tag">${tr('Aucune','None','لا شيء')}</span>`}<button type="button" class="chip-btn" style="padding:4px 12px;box-shadow:none" data-action="allergies-from-cart">${tr('Modifier','Edit','تعديل')}</button></div></div>
  <div class="summary"><div><span>${tr('Sous-total','Subtotal','المجموع الفرعي')}</span><span>${money(x.sub)}</span></div>${x.tax?`<div><span>${tr('Taxe','Tax','الضريبة')} ${r.tax_rate/100}%</span><span>${money(x.tax)}</span></div>`:''}${x.service?`<div><span>${tr('Service','Service','الخدمة')} ${r.service_rate/100}%</span><span>${money(x.service)}</span></div>`:''}<div class="grand"><span>Total</span><span>${money(x.total)}</span></div></div>
  <p class="notice">${tr('Vous réglez sur place. Le paiement en ligne arrivera bientôt.','You pay on site. Online payment is coming soon.','الدفع في المكان. الدفع الإلكتروني قريبًا.')}</p>
  <button class="primary" ${open()?'':'disabled'}>${I.check} ${tr('Envoyer la commande','Send order','إرسال الطلب')} · ${money(x.total)}</button>
 </form>`);
 sheetBody.onclick=null;
}

/* ---------- Order tracking ---------- */
function track(id){current=id||activeOrder()?.id||orders[0]?.id;if(!current){renderMenu();return}closeSheet();view='track';renderTrack();sync(true)}
function renderTrack(){
 setLangAttrs();const o=orders.find(x=>x.id===current);if(!o){view='menu';return data?renderMenu():renderLanding()}
 const st=o.order?.status||'new',ix=STEPS.indexOf(st),cur=o.order?.currency,isTable=o.order?.order_type==='table';
 const sub={new:tr('Le restaurant va la confirmer dans un instant.','The restaurant will confirm it shortly.','سيؤكد المطعم طلبك قريبًا.'),confirmed:tr('La cuisine l’a acceptée.','The kitchen accepted it.','قبل المطبخ طلبك.'),preparing:tr('Vos plats sont en cuisine.','Your dishes are being cooked.','أطباقك قيد التحضير.'),ready:isTable?tr('Elle arrive à votre table.','It is on its way to your table.','في الطريق إلى طاولتك.'):tr('Récupérez-la au comptoir.','Collect it at the counter.','استلمه من المنضدة.'),served:tr('Merci et bon appétit !','Thank you and enjoy!','شكرًا وبالهناء!'),cancelled:tr('Adressez-vous à l’équipe pour plus d’informations.','Please ask the staff for details.','يرجى سؤال الطاقم للتفاصيل.')}[st];
 const stepText=s=>({new:tr('Reçue','Received','مستلم'),confirmed:tr('Confirmée','Confirmed','مؤكد'),preparing:tr('En cuisine','In the kitchen','في المطبخ'),ready:tr('Prête','Ready','جاهز'),served:tr('Servie','Served','تم التقديم')}[s]);
 app.innerHTML=`${topbar()}<main id="main" class="wrap track">
 ${orders.length>1?`<div class="order-switch">${orders.map(x=>`<button data-switch="${h(x.id)}" aria-current="${x.id===current}">#${h(x.id)}</button>`).join('')}</div>`:''}
 <article class="ticket"><header class="ticket-head pattern ${st==='cancelled'?'cancelled':''}"><span class="code">${tr('COMMANDE','ORDER','الطلب')} #${h(o.id)}${o.order?.table_label?' · '+tr('TABLE','TABLE','طاولة')+' '+h(o.order.table_label):''}</span><h1>${h(statusLabel(st))}</h1><p>${h(sub)}</p></header><div class="perforation"></div>
 ${st!=='cancelled'?`<ol class="steps">${STEPS.map((s,i)=>`<li class="${i<ix||st==='served'?'done':i===ix?'now':''}"><span class="node">${i<ix||st==='served'?I.check:''}</span><div><strong>${stepText(s)}</strong>${i===ix&&st!=='served'?`<small>${tr('En cours','In progress','جارٍ')}</small>`:''}</div></li>`).join('')}</ol>`:''}
 ${o.items?.length?`<div class="ticket-items">${o.items.map(i=>`<div><span>${i.quantity} × ${h(i.item_name)}</span><span>${money(i.unit_price*i.quantity,cur)}</span></div>`).join('')}${+o.order.tax?`<div><span>${tr('Taxe','Tax','الضريبة')}</span><span>${money(o.order.tax,cur)}</span></div>`:''}${+o.order.service?`<div><span>${tr('Service','Service','الخدمة')}</span><span>${money(o.order.service,cur)}</span></div>`:''}<div class="grand"><span>Total</span><span>${money(o.order.total,cur)}</span></div></div>`:''}
 </article>
 ${data?`<button class="primary" data-action="menu">${I.plus} ${tr('Commander autre chose','Order something else','اطلب شيئًا آخر')}</button>`:''}
 ${data?.table?`<div class="grid2"><button class="secondary" data-call="waiter">${I.bell}${tr('Appeler un serveur','Call a waiter','نداء النادل')}</button><button class="secondary" data-call="bill">${I.receipt}${tr('L’addition','The bill','الفاتورة')}</button></div>`:''}
 <p class="refresh-note" id="sync-note">${FINAL.includes(st)?'':tr('Mise à jour automatique','Updates automatically','تحديث تلقائي')}</p>
 </main>`;
}
async function sync(force=false){
 clearTimeout(pollTimer);
 const due=orders.filter(o=>!o.order||!FINAL.includes(o.order.status)).slice(0,4);
 if(due.length&&!document.hidden){
  await Promise.all(due.map(async o=>{try{const r=await api('order-status',undefined,'&id='+encodeURIComponent(o.id)+'&token='+encodeURIComponent(o.token));const was=o.order?.status;o.order=r.order;o.items=r.items;if(was&&was!==r.order.status&&r.order.status==='ready'&&navigator.vibrate)navigator.vibrate([120,60,120])}catch(e){if(e.message==='not_found'){orders=orders.filter(x=>x!==o);saveOrders()}}}));
  lastSync=Date.now();
  if(view==='track')renderTrack();else renderDock();
 }
 const live=orders.some(o=>!o.order||!FINAL.includes(o.order.status));
 if(live)pollTimer=setTimeout(sync,view==='track'?8000:20000);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});

async function callStaff(kind,btn){
 if(callCooldown[kind]>Date.now()){toast(kind==='bill'?tr('L’addition est déjà demandée.','The bill has already been requested.','تم طلب الفاتورة مسبقًا.'):tr('Un serveur a déjà été appelé.','A waiter has already been called.','تم نداء النادل مسبقًا.'));return}
 if(btn)btn.disabled=true;
 try{await api('call',{slug:P.slug,table_token:P.table,kind});callCooldown[kind]=Date.now()+90000;toast(kind==='bill'?tr('C’est noté : l’addition arrive.','Done: the bill is on its way.','تم: الفاتورة في الطريق.'):tr('C’est noté : un serveur arrive.','Done: a waiter is coming.','تم: النادل قادم.'))}
 catch(e){toast(msg(e.message),true)}finally{if(btn)btn.disabled=false}
}

/* ---------- Events ---------- */
document.addEventListener('click',e=>{
 const x=e.target.closest('[data-lang],[data-inc],[data-dec],[data-action],[data-cat],[data-line],[data-call],[data-switch],[data-add-detail],[data-dish]');if(!x)return;
 if(x.dataset.lang){lang=x.dataset.lang;store.set('aps-order-lang',lang);closeSheet();return view==='track'?renderTrack():data?renderMenu():renderLanding()}
 if(x.dataset.inc){addItem(x.dataset.inc);refreshMenu();return}
 if(x.dataset.dec){removeOne(x.dataset.dec);refreshMenu();return}
 if(x.dataset.addDetail){const n=+($('#detail-q')?.textContent||1),note=($('#detail-note')?.value||'').trim().slice(0,300);addItem(x.dataset.addDetail,n,note);closeSheet();refreshMenu();toast(tr('Ajouté à votre commande.','Added to your order.','أضيف إلى طلبك.'));return}
 if(x.dataset.line){const l=cart[+x.dataset.line];if(l){l.quantity=Math.max(0,Math.min(20,l.quantity+ +x.dataset.d));if(!l.quantity)cart.splice(+x.dataset.line,1);saveCart();openCart();refreshMenu()}return}
 if(x.dataset.call){callStaff(x.dataset.call,x);return}
 if(x.dataset.switch){current=x.dataset.switch;renderTrack();return}
 if(x.dataset.cat){const s=document.querySelector(`[data-section="${x.dataset.cat}"]`);s?.scrollIntoView({behavior:'smooth',block:'start'});return}
 const a=x.dataset.action;
 if(a==='close')return closeSheet();
 if(a==='allergies')return openAllergies(false);
 if(a==='allergies-from-cart')return openAllergies(true);
 if(a==='cart')return openCart();
 if(a==='personal'){personal=x.checked;return openCart()}
 if(a==='track')return track(x.dataset.id);
 if(a==='menu'){if(data){renderMenu();window.scrollTo(0,0);sync()}return}
 if(a==='reload')return location.reload();
 if(x.dataset.dish)openDetail(x.dataset.dish);
});
document.addEventListener('input',e=>{
 if(e.target.id==='menu-search'){query=e.target.value.trim();renderList();spy();return}
 if(e.target.dataset.field){const l=cart[+e.target.dataset.idx];if(l){l[e.target.dataset.field]=e.target.value;saveCart()}}
});
document.addEventListener('change',e=>{
 if(e.target.name==='order_type'){const p=$('#pay-field');if(p)p.hidden=e.target.value!=='table'}
 if(e.target.id==='c-guests')people=+e.target.value;
});
document.addEventListener('submit',async e=>{
 e.preventDefault();const f=e.target;
 if(f.id==='allergy-form'){const fd=new FormData(f);allergyFilter=fd.getAll('a').filter(a=>ALLERGENS[a]);hideConflicts=fd.has('hide');store.set('aps-order-allergies',allergyFilter);store.set('aps-order-hide',hideConflicts);if(f.dataset.back){openCart()}else closeSheet();renderMenu();return}
 if(f.id==='checkout'){
  const b=e.submitter||f.querySelector('.primary');b.disabled=true;
  try{
   const fd=Object.fromEntries(new FormData(f));
   const r=await api('order-create',{slug:P.slug,table_token:P.table,order_type:fd.order_type,payment_method:fd.order_type==='table'?(fd.payment_method||'table'):'counter',guest_count:+fd.guest_count||1,customer_name:fd.customer_name||'',customer_note:fd.customer_note||'',allergies:allergyFilter,items:cart.map(l=>({item_id:l.item_id,quantity:l.quantity,guest_name:l.guest_name||'',note:l.note||''}))});
   orders.unshift({id:r.public_id,token:r.status_token,at:Date.now(),order:{public_id:r.public_id,status:'new',total:r.total,currency:r.currency,order_type:fd.order_type,table_label:fd.order_type==='table'?data.table?.label:null}});saveOrders();
   cart=[];saveCart();personal=false;track(r.public_id);window.scrollTo(0,0);
  }catch(x){toast(msg(x.message),true);if(x.message==='unavailable_item'||x.message==='orders_closed'){try{data=await api('menu',undefined,'&slug='+encodeURIComponent(P.slug)+'&table='+encodeURIComponent(P.table));cart=cart.filter(l=>item(l.item_id)&&canOrder(item(l.item_id)));saveCart();refreshMenu();openCart()}catch{}}}
  finally{b.disabled=false}
 }
});

/* ---------- Boot ---------- */
(async()=>{
 try{await api('session')}catch{}
 loadOrders();
 if(!P.slug){lang=lang||'fr';renderLanding();if(orders.length)sync();return}
 try{data=await api('menu',undefined,'&slug='+encodeURIComponent(P.slug)+'&table='+encodeURIComponent(P.table))}
 catch(e){lang=lang||'fr';if(orders.length){view='track';current=orders[0].id;renderTrack();sync(true);return}renderError(e.message);return}
 lang=lang||(['fr','en','ar'].includes(data.restaurant.default_language)?data.restaurant.default_language:'fr');
 cart=store.get(cartKey,[]).filter(l=>l&&item(l.item_id)&&l.quantity>0).map(l=>({...l,quantity:Math.min(20,+l.quantity),key:l.key||l.item_id+'|'+(l.note||'')}));
 renderMenu();sync();
})();
