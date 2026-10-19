'use strict';
const $=s=>document.querySelector(s);
const app=$('#app'),sheet=$('#sheet'),sheetBody=$('#sheet-body'),toastEl=$('#toast');
// The CSP (style-src 'self') ignores style="" attributes in markup; re-apply them through CSSOM, which CSP allows.
const cssom=n=>{if(n.nodeType!==1)return;if(n.hasAttribute('style'))n.style.cssText=n.getAttribute('style');n.querySelectorAll('[style]').forEach(e=>{e.style.cssText=e.getAttribute('style')})};
new MutationObserver(ms=>{for(const m of ms)m.addedNodes.forEach(cssom)}).observe(document.documentElement,{childList:true,subtree:true});
const store={
 get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}},
 set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
};
const ALLERGENS={gluten:['Gluten','Gluten','الغلوتين'],crustaceans:['Crustacés','Crustaceans','القشريات'],eggs:['Œufs','Eggs','البيض'],fish:['Poisson','Fish','السمك'],peanuts:['Arachides','Peanuts','الفول السوداني'],soy:['Soja','Soy','الصويا'],milk:['Lait','Milk','الحليب'],nuts:['Fruits à coque','Nuts','المكسرات'],celery:['Céleri','Celery','الكرفس'],mustard:['Moutarde','Mustard','الخردل'],sesame:['Sésame','Sesame','السمسم'],sulphites:['Sulfites','Sulphites','الكبريتيت'],lupin:['Lupin','Lupin','الترمس'],molluscs:['Mollusques','Molluscs','الرخويات']};
// Interface strings for es/de/zh live in order-i18n.js, keyed by the English text; menu content falls back to French.
const LANGS={fr:['Français','fr-MA'],en:['English','en-GB'],ar:['العربية','ar-MA'],es:['Español','es-ES'],de:['Deutsch','de-DE'],zh:['中文','zh-CN']};
const T=window.APS_I18N||{};
const STEPS=['new','confirmed','preparing','ready','served'];
const FINAL=['served','cancelled'];
// Served orders keep updating until they are paid, so the guest can rate the meal.
const done=o=>o.order&&(o.order.status==='cancelled'||(o.order.status==='served'&&o.order.payment_status!=='pending'));
const ORDER_TTL=12*3600*1000;

let csrf='',data=null,lang=LANGS[store.get('aps-order-lang',null)]?store.get('aps-order-lang',null):null,cart=[],orders=[],view='menu',current=null,query='',pollTimer=null,lastSync=0,personal=false,people=2;
let allergyFilter=store.get('aps-order-allergies',[]).filter(a=>ALLERGENS[a]),hideConflicts=!!store.get('aps-order-hide',false);
const callCooldown={};

const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=(fr,en,ar)=>lang==='ar'?(ar||fr):lang==='en'?(en||fr):lang==='fr'||!lang?fr:(T[lang]?.[en]||en||fr);
const locale=()=>LANGS[lang]?.[1]||'fr-MA';
const money=(n,c)=>new Intl.NumberFormat(locale(),{style:'currency',currency:c||data?.restaurant?.currency||'MAD'}).format((+n||0)/100);
const svg=p=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I={
 plus:svg('<path d="M12 5v14M5 12h14"/>'),minus:svg('<path d="M5 12h14"/>'),x:svg('<path d="M6 6l12 12M18 6 6 18"/>'),
 search:svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),bell:svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
 receipt:svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),check:svg('<path d="m5 12 5 5 9-10"/>'),
 shield:svg('<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/><path d="M9 12h6"/>'),bag:svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
 back:svg('<path d="M15 6l-6 6 6 6"/>'),qr:svg('<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>'),
 dish:svg('<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 7V5"/>'),globe:svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
 star:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/></svg>',ext:svg('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),spark:svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>')
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

const names=x=>x['name_'+lang]||x.name_fr;
const desc=x=>x['description_'+lang]||x.description_fr;
function allergensOf(i){try{const a=JSON.parse(i.allergens||'[]');return Array.isArray(a)?a.filter(x=>ALLERGENS[x]):[]}catch{return[]}}
const conflict=i=>allergensOf(i).some(a=>allergyFilter.includes(a));
const item=id=>data.items.find(i=>i.id==id);
const open=()=>!!+data.restaurant.accepting_orders;
const canOrder=i=>open()&&!!+i.available;
const qtyOf=id=>cart.filter(l=>l.item_id==id).reduce((n,l)=>n+l.quantity,0);
const count=()=>cart.reduce((n,l)=>n+l.quantity,0);
function totals(){const sub=cart.reduce((s,l)=>s+(+(item(l.item_id)?.price||0))*l.quantity,0),r=data.restaurant;const tax=Math.floor((sub*r.tax_rate+5000)/10000),service=Math.floor((sub*r.service_rate+5000)/10000);return{sub,tax,service,total:sub+tax+service}}
function setLangAttrs(){document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr'}
/* Flags drawn inline (emoji flags do not render on Windows). 3:2 frame, sliced to fit. */
function star(cx,cy,r,rot=0){let p='';for(let i=0;i<10;i++){const a=(rot-90+i*36)*Math.PI/180,q=i%2?r*.382:r;p+=(i?'L':'M')+(cx+q*Math.cos(a)).toFixed(2)+','+(cy+q*Math.sin(a)).toFixed(2)}return p+'Z'}
const FLAGS={
 fr:'<rect width="30" height="20" fill="#fff"/><rect width="10" height="20" fill="#002395"/><rect x="20" width="10" height="20" fill="#ED2939"/>',
 en:'<svg viewBox="0 0 60 30" width="30" height="20" preserveAspectRatio="xMidYMid slice"><rect width="60" height="30" fill="#012169"/><path d="M0 0l60 30M60 0 0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30M60 0 0 30" stroke="#C8102E" stroke-width="2"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></svg>',
 ar:`<rect width="30" height="20" fill="#C1272D"/><path d="M15 5.2 17.82 13.88 10.43 8.52H19.57L12.18 13.88Z" fill="none" stroke="#006233" stroke-width=".9" stroke-linejoin="round"/>`,
 es:'<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>',
 de:'<rect width="30" height="20" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#DD0000"/><rect y="13.33" width="30" height="6.67" fill="#FFCE00"/>',
 zh:`<rect width="30" height="20" fill="#EE1C25"/><g fill="#FFDE00"><path d="${star(5,5,3)}"/><path d="${star(10,2,1,23)}"/><path d="${star(12,4,1,46)}"/><path d="${star(12,7,1,70)}"/><path d="${star(10,9,1,21)}"/></g>`};
const flag=l=>`<svg class="flag" viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${FLAGS[l]||''}</svg>`;
const offered=()=>(data?.restaurant?.languages||['fr','en','ar']).filter(l=>LANGS[l]);
const langSwitch=()=>offered().length>1||!data?`<button class="lang-btn" data-action="languages" aria-label="${tr('Langue','Language','اللغة')} · ${h(LANGS[lang]?.[0]||'')}">${flag(lang)}<span>${h(LANGS[lang]?.[0]||'')}</span></button>`:'';
const topbar=()=>`<header class="topbar"><div class="wrap">${data?.restaurant?.logo_path?`<img class="top-logo" src="${h(data.restaurant.logo_path)}" alt="${h(data.restaurant.name)}">`:'<span class="mark">APS<i>.</i> ORDER</span>'}${langSwitch()}</div></header>`;
function langButtons(){return`<div class="lang-grid">${(data?offered():Object.keys(LANGS)).map(l=>`<button data-lang="${l}" lang="${l}" dir="${l==='ar'?'rtl':'ltr'}" aria-pressed="${lang===l}">${flag(l)}<span>${h(LANGS[l][0])}</span></button>`).join('')}</div>`}
const WELCOME={fr:'Bienvenue',en:'Welcome',ar:'مرحبًا',es:'Bienvenido',de:'Willkommen',zh:'欢迎'};
/* First screen after the QR scan: the guest picks a language, then the menu opens. */
function renderPicker(){
 const r=data.restaurant;document.documentElement.lang=lang||r.default_language||'fr';document.documentElement.dir='ltr';document.title=r.name+' · APS Order';
 app.innerHTML=`<main id="main" class="picker pattern"><div class="picker-card">${r.logo_path?`<img class="picker-logo" src="${h(r.logo_path)}" alt="">`:''}<h1>${h(r.name)}</h1>${data.table?`<span class="pill table">${h(tr('Table','Table','طاولة'))} ${h(data.table.label)}</span>`:''}<p class="picker-hello">${offered().map(l=>`<span lang="${l}">${h(WELCOME[l])}</span>`).join('<i>·</i>')}</p>${langButtons()}</div><p class="picker-foot">APS<span>.</span> Order</p></main>`;
}
const statusLabel=s=>({new:tr('Commande reçue','Order received','تم استلام الطلب'),confirmed:tr('Confirmée','Confirmed','تم التأكيد'),preparing:tr('En préparation','Being prepared','قيد التحضير'),ready:tr('Prête','Ready','جاهز'),served:tr('Servie · bon appétit','Served · enjoy','تم التقديم · بالهناء'),cancelled:tr('Annulée','Cancelled','ملغي')}[s]||s);

/* ---------- Landing (no restaurant in the link) ---------- */
function renderLanding(){
 setLangAttrs();document.title='APS Order';
 app.innerHTML=`<div class="landing">${topbar()}<div><section class="landing-hero pattern"><div class="wrap"><span class="eyebrow">${tr('Commande à table','Order at your table','الطلب من الطاولة')}</span><h1>${tr('Scannez. Choisissez. On s’occupe du reste.','Scan. Choose. We handle the rest.','امسح. اختر. ونحن نتكفل بالباقي.')}</h1><p>${tr('Pour voir le menu, scannez le QR code posé sur votre table avec l’appareil photo de votre téléphone.','To see the menu, scan the QR code on your table with your phone camera.','لعرض القائمة، امسح رمز QR الموجود على طاولتك بكاميرا هاتفك.')}</p></div></section>
 <main id="main" class="wrap"><div class="how"><div><span class="n">1</span><strong>${tr('Scannez','Scan','امسح')}</strong><span>${tr('Le QR code de votre table ouvre son menu.','Your table’s QR code opens its menu.','رمز طاولتك يفتح قائمتها.')}</span></div><div><span class="n">2</span><strong>${tr('Commandez','Order','اطلب')}</strong><span>${tr('En six langues, avec vos allergies signalées.','In six languages, with your allergies flagged.','بست لغات مع الإشارة إلى الحساسية.')}</span></div><div><span class="n">3</span><strong>${tr('Suivez','Follow','تابع')}</strong><span>${tr('Votre commande s’actualise en direct jusqu’au service.','Your order updates live until it is served.','يتم تحديث طلبك مباشرة حتى التقديم.')}</span></div></div>
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
const rateable=o=>o?.order&&o.order.status==='served'&&o.order.payment_status==='paid'&&o.order.rating==null;
const reviewUrl=o=>{const u=o?.order?.google_review_url||'';return/^https:\/\//i.test(u)&&!/PLACEHOLDER/i.test(u)?u:''};
function renderDock(){
 const d=$('#dock-inner');if(!d)return;const live=activeOrder(),n=count();
 const rate=!live&&orders.find(rateable);
 d.innerHTML=`${live?`<button class="live-chip" data-action="track" data-id="${h(live.id)}"><span class="dot"></span>${tr('Commande','Order','الطلب')} #${h(live.id)} · ${h(statusLabel(live.order.status))}</button>`:''}${rate?`<button class="live-chip rate-chip" data-action="rate-open" data-id="${h(rate.id)}">${I.star}${tr('Notez votre repas','Rate your meal','قيّم وجبتك')}</button>`:''}${n?`<button class="cart-bar" data-action="cart"><span>${I.bag} ${n} · ${tr('Voir la commande','View order','عرض الطلب')}</span><span class="total">${money(totals().total)}</span></button>`:''}`;
}
let rating=0;
function paintStars(){document.querySelectorAll('[data-star]').forEach(b=>b.setAttribute('aria-checked',String(+b.dataset.star<=rating)));const b=$('#rate-send');if(b)b.disabled=!rating;const l=$('#rate-label');if(l)l.textContent=rating?[tr('Décevant','Disappointing','مخيب'),tr('Moyen','Average','متوسط'),tr('Bien','Good','جيد'),tr('Très bien','Very good','جيد جدًا'),tr('Excellent','Excellent','ممتاز')][rating-1]:''}
function ratingCard(o){
 const url=reviewUrl(o),g=url?`<a class="primary google" href="${h(url)}" target="_blank" rel="noopener noreferrer">${I.ext} ${tr('Laisser un avis sur Google','Leave a Google review','اترك تقييمًا على Google')}</a>`:'';
 if(o.order.rating!=null)return`<section class="rate done"><div class="stars static" aria-label="${o.order.rating}/5">${[1,2,3,4,5].map(n=>`<span class="${n<=o.order.rating?'on':''}">${I.star}</span>`).join('')}</div><h2>${tr('Merci pour votre avis !','Thank you for your feedback!','شكرًا على رأيك!')}</h2><p>${o.order.rating>=4?tr('Ravi que le repas vous ait plu. Un mot sur Google aide beaucoup le restaurant.','Glad you enjoyed it. A few words on Google really help the restaurant.','سعداء أن الوجبة أعجبتك. كلمة على Google تساعد المطعم كثيرًا.'):tr('L’équipe lira votre retour. Vous pouvez aussi partager votre avis publiquement.','The team will read your feedback. You can also share it publicly.','سيقرأ الفريق ملاحظتك. يمكنك أيضًا مشاركة رأيك علنًا.')}</p>${g}</section>`;
 return`<section class="rate" id="rate"><h2>${tr('Comment était votre repas ?','How was your meal?','كيف كانت وجبتك؟')}</h2><p>${tr('Votre note va directement à l’équipe.','Your rating goes straight to the team.','تقييمك يصل مباشرة إلى الفريق.')}</p><div class="stars" role="radiogroup" aria-label="${tr('Note','Rating','التقييم')}">${[1,2,3,4,5].map(n=>`<button type="button" role="radio" data-star="${n}" aria-checked="${n<=rating}" aria-label="${n}/5">${I.star}</button>`).join('')}</div><span class="rate-label" id="rate-label"></span><form id="rate-form" data-id="${h(o.id)}" style="display:grid;gap:12px;width:100%"><textarea name="comment" maxlength="500" rows="2" aria-label="${tr('Commentaire (facultatif)','Comment (optional)','تعليق (اختياري)')}" placeholder="${tr('Un commentaire ? (facultatif)','Any comment? (optional)','أي تعليق؟ (اختياري)')}"></textarea><button class="primary" id="rate-send" ${rating?'':'disabled'}>${tr('Envoyer ma note','Send my rating','إرسال التقييم')}</button></form></section>`;
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
  <div class="summary"><div><span>${tr('Sous-total','Subtotal','المجموع الفرعي')}</span><span>${money(x.sub)}</span></div>${x.tax?`<div><span>${tr('Taxe','Tax','الضريبة')} ${r.tax_rate/100}%</span><span>${money(x.tax)}</span></div>`:''}${x.service?`<div><span>${tr('Service','Service','الخدمة')} ${r.service_rate/100}%</span><span>${money(x.service)}</span></div>`:''}<div class="grand"><span>${tr('Total','Total','المجموع')}</span><span>${money(x.total)}</span></div></div>
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
 ${o.order&&(rateable(o)||o.order.rating!=null)?ratingCard(o):''}
 <article class="ticket"><header class="ticket-head pattern ${st==='cancelled'?'cancelled':''}">${o.order?.restaurant_name?`<span class="code">${h(o.order.restaurant_name)}</span>`:''}<span class="code">${tr('COMMANDE','ORDER','الطلب')} #${h(o.id)}${o.order?.table_label?' · '+tr('TABLE','TABLE','طاولة')+' '+h(o.order.table_label):''}</span><h1>${h(statusLabel(st))}</h1><p>${h(sub)}</p></header><div class="perforation"></div>
 ${st!=='cancelled'?`<ol class="steps">${STEPS.map((s,i)=>`<li class="${i<ix||st==='served'?'done':i===ix?'now':''}"><span class="node">${i<ix||st==='served'?I.check:''}</span><div><strong>${stepText(s)}</strong>${i===ix&&st!=='served'?`<small>${tr('En cours','In progress','جارٍ')}</small>`:''}</div></li>`).join('')}</ol>`:''}
 ${st==='served'&&o.order?.payment_status==='pending'?`<p class="notice" style="margin:0 22px 16px">${tr('Une fois l’addition réglée, vous pourrez noter votre repas ici.','Once the bill is settled you can rate your meal here.','بعد دفع الفاتورة يمكنك تقييم وجبتك هنا.')}</p>`:''}
 ${o.items?.length?`<div class="ticket-items">${o.items.map(i=>`<div><span>${i.quantity} × ${h(i.item_name)}</span><span>${money(i.unit_price*i.quantity,cur)}</span></div>`).join('')}${+o.order.tax?`<div><span>${tr('Taxe','Tax','الضريبة')}</span><span>${money(o.order.tax,cur)}</span></div>`:''}${+o.order.service?`<div><span>${tr('Service','Service','الخدمة')}</span><span>${money(o.order.service,cur)}</span></div>`:''}<div class="grand"><span>${tr('Total','Total','المجموع')}</span><span>${money(o.order.total,cur)}</span></div></div>`:''}
 </article>
 ${data?`<button class="primary" data-action="menu">${I.plus} ${tr('Commander autre chose','Order something else','اطلب شيئًا آخر')}</button>`:''}
 ${data?.table?`<div class="grid2"><button class="secondary" data-call="waiter">${I.bell}${tr('Appeler un serveur','Call a waiter','نداء النادل')}</button><button class="secondary" data-call="bill">${I.receipt}${tr('L’addition','The bill','الفاتورة')}</button></div>`:''}
 <p class="refresh-note" id="sync-note">${done(o)?'':tr('Mise à jour automatique','Updates automatically','تحديث تلقائي')}</p>
 </main>`;
}
async function sync(force=false){
 clearTimeout(pollTimer);
 const due=orders.filter(o=>!done(o)).slice(0,4);
 if(due.length&&!document.hidden){
  await Promise.all(due.map(async o=>{try{const r=await api('order-status',undefined,'&id='+encodeURIComponent(o.id)+'&token='+encodeURIComponent(o.token));const was=o.order?.status;o.order=r.order;o.items=r.items;if(was&&was!==r.order.status&&r.order.status==='ready'&&navigator.vibrate)navigator.vibrate([120,60,120])}catch(e){if(e.message==='not_found'){orders=orders.filter(x=>x!==o);saveOrders()}}}));
  lastSync=Date.now();
  if(view==='track'){const typing=document.activeElement?.closest?.('#rate-form');if(!typing)renderTrack()}else renderDock();
 }
 const live=orders.some(o=>!done(o));
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
 const x=e.target.closest('[data-star],[data-lang],[data-inc],[data-dec],[data-action],[data-cat],[data-line],[data-call],[data-switch],[data-add-detail],[data-dish]');if(!x)return;
 if(x.dataset.lang){lang=x.dataset.lang;store.set('aps-order-lang',lang);closeSheet();if(next&&!session('aps-order-picked')){session('aps-order-picked','1');window.scrollTo(0,0);return next()}return view==='track'?renderTrack():data?renderMenu():renderLanding()}
 if(x.dataset.star){rating=+x.dataset.star;return paintStars()}
 if(x.dataset.inc){addItem(x.dataset.inc);refreshMenu();return}
 if(x.dataset.dec){removeOne(x.dataset.dec);refreshMenu();return}
 if(x.dataset.addDetail){const n=+($('#detail-q')?.textContent||1),note=($('#detail-note')?.value||'').trim().slice(0,300);addItem(x.dataset.addDetail,n,note);closeSheet();refreshMenu();toast(tr('Ajouté à votre commande.','Added to your order.','أضيف إلى طلبك.'));return}
 if(x.dataset.line){const l=cart[+x.dataset.line];if(l){l.quantity=Math.max(0,Math.min(20,l.quantity+ +x.dataset.d));if(!l.quantity)cart.splice(+x.dataset.line,1);saveCart();openCart();refreshMenu()}return}
 if(x.dataset.call){callStaff(x.dataset.call,x);return}
 if(x.dataset.switch){current=x.dataset.switch;renderTrack();return}
 if(x.dataset.cat){const s=document.querySelector(`[data-section="${x.dataset.cat}"]`);s?.scrollIntoView({behavior:'smooth',block:'start'});return}
 const a=x.dataset.action;
 if(a==='close')return closeSheet();
 if(a==='languages')return openSheet(tr('Langue','Language','اللغة'),langButtons());
 if(a==='rate-open'){current=x.dataset.id;return track(current)}
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
 if(f.id==='rate-form'){
  const o=orders.find(x=>x.id===f.dataset.id),b=$('#rate-send');if(!o||!rating)return;b.disabled=true;
  try{const r=await api('order-rate',{id:o.id,token:o.token,rating,comment:(new FormData(f).get('comment')||'').trim()});o.order.rating=rating;if(r.google_review_url)o.order.google_review_url=r.google_review_url;rating=0;renderTrack();$('#rate')?.scrollIntoView?.({block:'nearest'})}
  catch(x){toast(x.message==='conflict'?tr('Cette commande a déjà été notée.','This order was already rated.','تم تقييم هذا الطلب مسبقًا.'):msg(x.message),true);b.disabled=false}
  return;
 }
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
const session=(k,v)=>{try{if(v===undefined)return sessionStorage.getItem(k);sessionStorage.setItem(k,v)}catch{}};
// Reception hands guests a QR to /r/<slug>/#o=<order>.<token> so they can follow and rate an order they did not place themselves.
const hashOrder=(()=>{const m=location.hash.match(/^#o=([A-F0-9]{8})\.([a-f0-9]{48})$/);if(!m)return null;history.replaceState(null,'',location.pathname+location.search);return{id:m[1],token:m[2]}})();
let next=null;
(async()=>{
 try{await api('session')}catch{}
 loadOrders();
 if(!P.slug){lang=lang||'fr';renderLanding();if(orders.length)sync();return}
 try{data=await api('menu',undefined,'&slug='+encodeURIComponent(P.slug)+'&table='+encodeURIComponent(P.table))}
 catch(e){lang=lang||'fr';if(orders.length){view='track';current=orders[0].id;renderTrack();sync(true);return}renderError(e.message);return}
 lang=lang&&offered().includes(lang)?lang:offered().includes(data.restaurant.default_language)?data.restaurant.default_language:offered()[0];
 cart=store.get(cartKey,[]).filter(l=>l&&item(l.item_id)&&l.quantity>0).map(l=>({...l,quantity:Math.min(20,+l.quantity),key:l.key||l.item_id+'|'+(l.note||'')}));
 if(hashOrder&&!orders.some(o=>o.id===hashOrder.id))orders.unshift({...hashOrder,at:Date.now()}),saveOrders();
 next=hashOrder?()=>track(hashOrder.id):()=>{renderMenu();sync()};
 if(offered().length>1&&!session('aps-order-picked'))return renderPicker();
 if(!offered().includes(lang))lang=offered()[0];next();
})();
