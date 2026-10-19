// Local stand-in for api.php so the redesigned pages can be exercised without PHP.
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../new/public');
const now=()=>Math.floor(Date.now()/1000);
const T0=now();
const restaurant={id:1,name:'Dar Zellige',slug:'dar-zellige',logo_path:'',currency:'MAD',tax_rate:1000,service_rate:0,default_language:'fr',accepting_orders:1,subscription_plan:'Growth',subscription_status:'active',subscription_end:'2027-03-31',languages:'["fr","en","ar"]',order_mode:'table',created_at:T0};
const categories=[[1,'Entrées','Starters','مقبلات'],[2,'Tajines','Tagines','طواجن'],[3,'Grillades','Grills','مشويات'],[4,'Desserts','Desserts','حلويات'],[5,'Boissons','Drinks','مشروبات']].map(([id,fr,en,ar],i)=>({id,restaurant_id:1,name_fr:fr,name_en:en,name_ar:ar,sort_order:i,active:1}));
let iid=0;const it=(cat,fr,en,ar,dfr,den,dar,price,al,feat=0,av=1)=>({id:++iid,restaurant_id:1,category_id:cat,name_fr:fr,name_en:en,name_ar:ar,description_fr:dfr,description_en:den,description_ar:dar,price,image_path:'',allergens:JSON.stringify(al),available:av,featured:feat,sort_order:iid,created_at:T0});
const items=[
 it(1,'Harira','Harira soup','حريرة','Soupe de tomates, lentilles et pois chiches, dattes à part.','Tomato, lentil and chickpea soup, served with dates.','شوربة الطماطم والعدس والحمص مع التمر.',3500,['gluten','celery'],1),
 it(1,'Zaalouk','Zaalouk','زعلوك','Caviar d’aubergines fumées, cumin et huile d’olive.','Smoked aubergine dip, cumin and olive oil.','متبل الباذنجان المدخن بالكمون وزيت الزيتون.',3000,[]),
 it(1,'Briouates au fromage','Cheese briouates','بريوات بالجبن','Feuilles de brick croustillantes, fromage frais et herbes.','Crisp pastry, fresh cheese and herbs.','عجينة مقرمشة بالجبن الطري والأعشاب.',4200,['gluten','milk','eggs']),
 it(2,'Tajine poulet citron confit','Chicken tagine, preserved lemon','طاجين دجاج بالحامض المرقد','Poulet fermier, olives violettes, citron confit maison.','Farm chicken, purple olives, house preserved lemon.','دجاج بلدي، زيتون بنفسجي وحامض مرقد.',9500,[],1),
 it(2,'Tajine kefta aux œufs','Kefta and egg tagine','طاجين كفتة بالبيض','Boulettes de bœuf épicées, sauce tomate, œufs pochés.','Spiced beef meatballs, tomato sauce, poached eggs.','كرات لحم متبلة، صلصة طماطم، بيض.',8500,['eggs']),
 it(2,'Tajine agneau pruneaux','Lamb and prune tagine','طاجين لحم بالبرقوق','Épaule d’agneau confite, pruneaux, amandes grillées, sésame.','Slow-cooked lamb shoulder, prunes, toasted almonds, sesame.','كتف خروف، برقوق، لوز محمص وسمسم.',12000,['nuts','sesame'],1),
 it(3,'Brochettes de poulet','Chicken skewers','قطبان دجاج','Marinade chermoula, frites maison, salade marocaine.','Chermoula marinade, house fries, Moroccan salad.','تتبيلة شرمولة، بطاطس مقلية، سلطة مغربية.',7800,[]),
 it(3,'Poisson du jour grillé','Grilled catch of the day','سمك اليوم المشوي','Selon arrivage du port de Rabat.','Depending on the Rabat harbour catch.','حسب صيد ميناء الرباط.',14000,['fish'],0,0),
 it(4,'Pastilla au lait','Milk pastilla','بسطيلة بالحليب','Feuilles croustillantes, crème à la fleur d’oranger, amandes.','Crisp leaves, orange blossom cream, almonds.','أوراق مقرمشة، كريمة ماء الزهر ولوز.',4500,['gluten','milk','nuts','eggs']),
 it(4,'Salade d’oranges à la cannelle','Orange and cinnamon salad','سلطة البرتقال بالقرفة','Oranges de Berkane, cannelle, eau de fleur d’oranger.','Berkane oranges, cinnamon, orange blossom water.','برتقال بركان، قرفة، ماء الزهر.',2800,[]),
 it(5,'Thé à la menthe','Mint tea','أتاي بالنعناع','Théière pour deux, menthe fraîche.','Pot for two, fresh mint.','براد لشخصين بالنعناع الطازج.',2500,[]),
 it(5,'Jus d’avocat','Avocado smoothie','عصير الأفوكادو','Avocat, lait, amandes, dattes.','Avocado, milk, almonds, dates.','أفوكادو، حليب، لوز وتمر.',3200,['milk','nuts'])];
const tables=[['1','Salle',4],['2','Salle',2],['3','Salle',6],['4','Terrasse',4],['5','Terrasse',4],['6','Patio',8]].map(([label,zone,seats],i)=>({id:i+1,restaurant_id:1,label,zone,seats,access_token:'tok'+(i+1)+'a1b2c3d4e5f6a7b8c9d0e1f2',active:1}));
let oid=0;const orders=[],orderItems=[];
function mk(table,status,minsAgo,lines,extra={}){const id=++oid,sub=lines.reduce((s,[i,q])=>s+items[i-1].price*q,0),tax=Math.floor((sub*1000+5000)/10000);const o={id,public_id:(0xA3F0+id*7919).toString(16).toUpperCase().padStart(8,'0').slice(-8),status_token:'st'+id,restaurant_id:1,table_id:table,order_type:table?'table':'takeaway',guest_count:extra.guests||2,customer_name:extra.name||'',customer_note:extra.note||'',allergies:JSON.stringify(extra.allergies||[]),status,payment_method:'table',payment_status:extra.paid?'paid':'pending',subtotal:sub,tax,service:0,total:sub+tax,created_at:now()-minsAgo*60,updated_at:now()-Math.max(0,minsAgo-5)*60};orders.push(o);lines.forEach(([i,q,g,n])=>orderItems.push({id:orderItems.length+1,order_id:id,item_id:i,item_name:items[i-1].name_fr,unit_price:items[i-1].price,quantity:q,guest_name:g||'',note:n||'',allergens:items[i-1].allergens}));return o}
for(let d=13;d>=1;d--)for(let k=0;k<3+(d*7)%5;k++)mk(1+(k%6),'served',d*1440+k*37+600,[[1+(k*5+d)%12,1+(k%2)],[11,1]],{paid:true});
mk(2,'served',95,[[4,1],[11,2]],{});mk(5,'cancelled',80,[[7,1]],{});mk(null,'served',70,[[6,1]],{paid:true});
mk(3,'ready',24,[[6,2],[4,1],[11,3]],{guests:4});
mk(1,'preparing',14,[[5,1],[2,1]],{allergies:['eggs'],note:'Mon fils est allergique aux œufs, merci de faire attention.',name:'Salma'});
mk(4,'preparing',8,[[7,2],[10,2]],{});
mk(6,'confirmed',5,[[1,3],[3,2],[4,2],[11,2]],{guests:6,name:'Youssef'});
mk(5,'new',2,[[9,2],[11,1]],{allergies:['nuts']});
mk(null,'new',1,[[7,1],[12,1]],{name:'Karim'});
const calls=[{id:1,restaurant_id:1,table_id:4,kind:'bill',created_at:now()-180,resolved_at:null}];
const user={id:7,name:'Nadia Bennani',email:'nadia@darzellige.ma',role:'restaurant_admin',restaurant_id:1};
const users=[{...user,active:1,activated:1,mfa_enabled:1},{id:8,name:'Omar',email:'omar@darzellige.ma',role:'staff',restaurant_id:1,active:1,activated:1,mfa_enabled:1},{id:9,name:'Hiba',email:'hiba@darzellige.ma',role:'staff',restaurant_id:1,active:1,activated:0,mfa_enabled:0}];
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj))};
const ok=(res,d={})=>send(res,200,{ok:true,csrf:'mock',...d});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
 const u=new URL(req.url,'http://x');
 if(u.pathname==='/api.php'){
  let b='';req.on('data',c=>b+=c);req.on('end',()=>{
   const a=u.searchParams.get('action'),d=b?JSON.parse(b):{};const staff=(req.headers.referer||'').includes('/staff');
   const loggedOut=(req.headers.referer||'').includes('loggedout');
   if(a==='session')return ok(res,{user:staff&&!loggedOut?user:null});
   if(a==='menu'){if(u.searchParams.get('slug')!=='dar-zellige')return send(res,404,{ok:false,error:'not_found'});const table=tables.find(x=>x.access_token===u.searchParams.get('table'))||null;return ok(res,{restaurant,table:table&&{id:table.id,label:table.label,seats:table.seats,zone:table.zone},categories,items})}
   if(a==='order-status'){const o=orders.find(x=>x.public_id===u.searchParams.get('id')&&x.status_token===u.searchParams.get('token'));if(!o)return send(res,404,{ok:false,error:'not_found'});const t=tables.find(x=>x.id===o.table_id);return ok(res,{order:{public_id:o.public_id,status:o.status,payment_status:o.payment_status,order_type:o.order_type,subtotal:o.subtotal,tax:o.tax,service:o.service,total:o.total,created_at:o.created_at,updated_at:o.updated_at,table_label:t?.label||null,currency:'MAD'},items:orderItems.filter(i=>i.order_id===o.id)})}
   if(a==='order-create'){const t=tables.find(x=>x.access_token===d.table_token);const o=mk(d.order_type==='table'?t.id:null,'preparing',0,d.items.map(l=>[l.item_id,l.quantity,l.guest_name,l.note]),{allergies:d.allergies,name:d.customer_name,note:d.customer_note,guests:d.guest_count});return ok(res,{public_id:o.public_id,status_token:o.status_token,total:o.total,currency:'MAD'})}
   if(a==='call'){calls.push({id:calls.length+1,restaurant_id:1,table_id:tables.find(x=>x.access_token===d.table_token).id,kind:d.kind,created_at:now(),resolved_at:null});return ok(res)}
   if(a==='dashboard'){const top={};orderItems.forEach(i=>{const o=orders[i.order_id-1];if(o.status==='cancelled')return;top[i.item_id]=top[i.item_id]||{item_name:i.item_name,quantity:0,revenue:0};top[i.item_id].quantity+=i.quantity;top[i.item_id].revenue+=i.quantity*i.unit_price});
    return ok(res,{user,now:now(),restaurants:[restaurant],categories,items,tables,orders:orders.map(o=>({...o,table_label:tables.find(t=>t.id===o.table_id)?.label||null,item_count:orderItems.filter(i=>i.order_id===o.id).reduce((s,i)=>s+i.quantity,0)})).sort((a,b)=>b.id-a.id),calls:calls.filter(c=>!c.resolved_at).map(c=>({...c,table_label:tables[c.table_id-1].label,zone:tables[c.table_id-1].zone})),top_items:Object.values(top).sort((a,b)=>b.quantity-a.quantity).slice(0,8),users})}
   if(a==='order-detail'){const o=orders.find(x=>x.id===d.id);const t=tables.find(x=>x.id===o.table_id);return ok(res,{order:{...o,table_label:t?.label||null,table_zone:t?.zone||null},items:orderItems.filter(i=>i.order_id===o.id)})}
   if(a==='order-update'){const o=orders.find(x=>x.id===d.id);if(d.status)o.status=d.status;if(d.payment_status)o.payment_status=d.payment_status;o.updated_at=now();return ok(res)}
   if(a==='call-resolve'){calls.find(c=>c.id===d.id).resolved_at=now();return ok(res)}
   if(a==='item-availability'){const i=items.find(x=>x.id===d.id);i.available=i.available?0:1;return ok(res)}
   return ok(res,{id:1});
  });return;
 }
 let p=u.pathname;if(p.startsWith('/r/'))p='/index.html';if(p==='/staff'||p==='/staff/')p='/staff.html';if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);return res.end('nf')}
 res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
}).listen(4190,()=>console.log('mock on 4190'));
