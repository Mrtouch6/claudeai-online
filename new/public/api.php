<?php
declare(strict_types=1);ini_set('display_errors','0');require dirname(__DIR__).'/app/core.php';
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
try{
 if(!local_mode()&&($_SERVER['HTTPS']??'')!=='on'){header('Location: '.ORIGIN.'/');http_response_code(308);exit;}
 if(!local_mode()&&strtolower($_SERVER['HTTP_HOST']??'')!=='order.apservices.vip')fail(400,'host');
 db();maintenance();$sd=store_dir().'/sessions';if(!is_dir($sd))mkdir($sd,0700);session_save_path($sd);ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');ini_set('session.gc_maxlifetime',(string)SESSION_MAX);session_name(local_mode()?'APS_ORDER_TEST':'__Host-APSORDER');session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>!local_mode(),'httponly'=>true,'samesite'=>'Strict']);session_start();if(empty($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32));
 $a=$_GET['action']??'session';$m=$_SERVER['REQUEST_METHOD']??'GET';$d=[];
 if($m==='POST'){if((int)($_SERVER['CONTENT_LENGTH']??0)>60000)fail(413,'validation');$origin=$_SERVER['HTTP_ORIGIN']??'';if($origin!==''&&!in_array($origin,local_mode()?['http://127.0.0.1:4190']:[ORIGIN],true))fail(403,'csrf');$h=$_SERVER['HTTP_X_CSRF_TOKEN']??'';if(!is_string($h)||!hash_equals($_SESSION['csrf'],$h))fail(403,'csrf');$body=file_get_contents('php://input',false,null,0,60001);if($body===false||strlen($body)>60000)fail(413,'validation');$d=json_decode($body,true);if(!is_array($d))fail(422,'validation');}
 elseif($m!=='GET')fail(405,'method');
 $getActions=['session','menu','order-status','enroll','dashboard','screen-playlist'];if(($m==='GET')!==in_array($a,$getActions,true))fail(405,'method');
 if($a==='session'){ok(['user'=>($u=session_user(false))?pub($u):null,'csrf'=>$_SESSION['csrf'],'pending'=>!empty($_SESSION['pending'])]);}

 // ---- Public: customers -------------------------------------------------
 if($a==='menu'){
  $r=open_restaurant(text($_GET,'slug',80));if(!$r)fail(404,'not_found');
  $token=$_GET['table']??'';$table=is_string($token)&&$token!==''?one('SELECT id,label,seats,zone FROM dining_tables WHERE restaurant_id=? AND access_token=? AND active=1',[$r['id'],$token]):null;
  $restaurant=array_intersect_key($r,array_flip(['id','name','slug','logo_path','currency','tax_rate','service_rate','default_language','accepting_orders']));$restaurant['languages']=langs($r);
  ok(['restaurant'=>$restaurant,'table'=>$table,'categories'=>all('SELECT id,name_fr,name_en,name_ar,name_es,name_de,name_zh,sort_order FROM categories WHERE restaurant_id=? AND active=1 ORDER BY sort_order,id',[$r['id']]),'items'=>all('SELECT i.id,i.category_id,i.name_fr,i.name_en,i.name_ar,i.name_es,i.name_de,i.name_zh,i.description_fr,i.description_en,i.description_ar,i.description_es,i.description_de,i.description_zh,i.price,i.image_path,i.allergens,i.available,i.featured,i.sort_order FROM items i JOIN categories c ON c.id=i.category_id AND c.active=1 WHERE i.restaurant_id=? ORDER BY i.sort_order,i.id',[$r['id']])]);
 }
 if($a==='order-status'){
  $id=$_GET['id']??'';$token=$_GET['token']??'';if(!is_string($id)||!is_string($token)||$token==='')fail(404,'not_found');
  $o=one('SELECT o.id,o.public_id,o.status,o.payment_status,o.order_type,o.subtotal,o.tax,o.service,o.total,o.created_at,o.updated_at,o.rating,t.label AS table_label,r.currency,r.name AS restaurant_name,r.slug,r.logo_path,r.google_review_url FROM orders o JOIN restaurants r ON r.id=o.restaurant_id LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.public_id=? AND o.status_token=?',[$id,$token]);if(!$o)fail(404,'not_found');
  $items=all('SELECT item_name,quantity,unit_price FROM order_items WHERE order_id=? ORDER BY id',[$o['id']]);unset($o['id']);ok(['order'=>$o,'items'=>$items]);
 }
 if($a==='order-create'){
  // Customers in one venue usually share its Wi-Fi (one IP), so limit per browser session and per table, with a generous IP ceiling.
  rate('order-session',session_id(),12,600);rate('order-ip',client_ip(),200,600);
  $r=open_restaurant(text($d,'slug',80));if(!$r||!(int)$r['accepting_orders'])fail(409,'orders_closed');
  $type=choice($d,'order_type',['table','counter','takeaway']);$table=null;if($type==='table'){$tok=text($d,'table_token',128);$table=one('SELECT * FROM dining_tables WHERE restaurant_id=? AND access_token=? AND active=1',[$r['id'],$tok]);if(!$table)fail(422,'table');rate('order-table',(string)$table['id'],30,600);}
  $pay=choice($d,'payment_method',['table','counter']);if($type!=='table')$pay='counter';
  $o=place_order($r,$d,$table,$type,$pay,'new',null);
  audit('order_created',['id'=>null,'restaurant_id'=>$r['id']],'order',$o['id']);unset($o['id']);ok($o);
 }
 if($a==='order-rate'){
  // Guests rate once, only after the order was served and paid; the review link is offered whatever the score (Google forbids review gating).
  rate('rate-session',session_id(),20,600);rate('rate-ip',client_ip(),200,600);
  $o=one('SELECT o.id,o.status,o.payment_status,o.rating,r.google_review_url FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.public_id=? AND o.status_token=?',[text($d,'id',16),text($d,'token',64)]);if(!$o)fail(404,'not_found');
  if($o['status']!=='served'||$o['payment_status']!=='paid')fail(409,'conflict');
  if(q('UPDATE orders SET rating=?,rating_comment=?,rated_at=? WHERE id=? AND rating IS NULL',[intrange($d,'rating',1,5),text($d,'comment',500,false),time(),$o['id']])->rowCount()!==1)fail(409,'conflict');
  ok(['google_review_url'=>$o['google_review_url']]);
 }
 if($a==='call'){
  rate('call-session',session_id(),10,600);rate('call-ip',client_ip(),120,600);
  $r=open_restaurant(text($d,'slug',80));if(!$r)fail(404,'not_found');
  $table=one('SELECT * FROM dining_tables WHERE restaurant_id=? AND access_token=? AND active=1',[$r['id'],text($d,'table_token',128)]);if(!$table)fail(422,'table');
  $kind=choice($d,'kind',['waiter','bill']);
  if(!one('SELECT id FROM service_requests WHERE table_id=? AND kind=? AND resolved_at IS NULL',[$table['id'],$kind]))q('INSERT INTO service_requests(restaurant_id,table_id,kind,created_at)VALUES(?,?,?,?)',[$r['id'],$table['id'],$kind,time()]);
  ok();
 }

 // ---- Public: digital signage players ------------------------------------
 if($a==='screen-pair'){
  rate('screen-pair-ip',client_ip(),10,900);rate('screen-pair-all','*',300,3600);
  $pin=text($d,'pin',6);if(!preg_match('/^\d{6}$/',$pin))fail(422,'validation');
  $s=one('SELECT * FROM screens WHERE pin=? AND pin_expires_at>=?',[$pin,time()]);if(!$s)fail(401,'pin');
  $tok=bin2hex(random_bytes(32));if(q('UPDATE screens SET token_hash=?,pin=NULL,pin_expires_at=NULL,last_seen=? WHERE id=? AND pin=?',[hash('sha256',$tok),time(),$s['id'],$pin])->rowCount()!==1)fail(401,'pin');
  audit('screen_paired',['id'=>null,'restaurant_id'=>$s['restaurant_id']],'screen',(int)$s['id']);ok(['token'=>$tok,'name'=>$s['name']]);
 }
 if($a==='screen-playlist'){
  $tok=$_SERVER['HTTP_X_SCREEN_TOKEN']??'';$s=is_string($tok)&&preg_match('/^[a-f0-9]{64}$/',$tok)?one('SELECT * FROM screens WHERE token_hash=?',[hash('sha256',$tok)]):null;
  if(!$s){rate('screen-bad-ip',client_ip(),30,600);fail(401,'auth');}
  rate('screen-poll',(string)$s['id'],120,600);$now=time();if((int)$s['last_seen']<$now-20)q('UPDATE screens SET last_seen=? WHERE id=?',[$now,$s['id']]);
  $r=one('SELECT * FROM restaurants WHERE id=?',[$s['restaurant_id']]);$today=date('Y-m-d');
  $items=subscribed($r)?all('SELECT c.id,c.kind,c.path,c.title,c.duration FROM signage_content c WHERE c.restaurant_id=? AND c.active=1 AND (c.start_date IS NULL OR c.start_date<=?) AND (c.end_date IS NULL OR c.end_date>=?) AND EXISTS(SELECT 1 FROM signage_targets t WHERE t.content_id=c.id AND (t.screen_id IS NULL OR t.screen_id=?)) ORDER BY c.sort_order,c.id',[$r['id'],$today,$today,$s['id']]):[];
  ok(['screen'=>['name'=>$s['name']],'restaurant'=>['name'=>$r['name'],'logo_path'=>$r['logo_path']],'items'=>$items,'poll'=>60]);
 }

 // ---- Staff sign-in -----------------------------------------------------
 if($a==='login'){
  $em=email($d);rate('login-ip',client_ip(),30,900);rate('login-account',$em,10,900);$p=rawpass($d,'password');$u=one('SELECT * FROM users WHERE email=?',[$em]);$dummy='$2y$12$qbfe.AkckzGGsgUDCeUg3erbbsewlWsOFplqeEEQSce76JoZvss1G';if(!$u||!(int)$u['active']||!password_verify($p,$u['password_hash']??$dummy)){audit('login_failed');fail(401,'credentials');}if(!MFA_REQUIRED){login_user($u);ok(['next'=>'done','user'=>pub($u),'csrf'=>$_SESSION['csrf']]);}session_regenerate_id(true);$_SESSION=['pending'=>(int)$u['id'],'pending_at'=>time(),'version'=>(int)$u['session_version'],'csrf'=>bin2hex(random_bytes(32))];ok(['next'=>$u['mfa_secret']?'verify':'enroll','csrf'=>$_SESSION['csrf']]);
 }
 if($a==='request-link'){$em=email($d);rate('reset-ip',client_ip(),8,900);rate('reset-account',$em,3,900);$u=one('SELECT * FROM users WHERE email=? AND active=1',[$em]);if($u)send_link($u);usleep(150000);ok(['message'=>'link_requested']);}
 if($a==='activate'){rate('activate',client_ip(),15,900);$t=text($d,'token',64);if(!preg_match('/^[a-f0-9]{64}$/',$t))fail(400,'expired');$hash=phash(pass($d));db()->beginTransaction();$x=one('SELECT t.*,u.active FROM tokens t JOIN users u ON u.id=t.user_id WHERE token_hash=?',[hash('sha256',$t)]);if(!$x||$x['used_at']||$x['expires_at']<time()||!$x['active']){db()->rollBack();fail(400,'expired');}q('UPDATE tokens SET used_at=? WHERE user_id=? AND used_at IS NULL',[time(),$x['user_id']]);q('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',[$hash,$x['user_id']]);db()->commit();$_SESSION=[];session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));ok(['csrf'=>$_SESSION['csrf']]);}
 if(in_array($a,['enroll','confirm-enroll','verify'],true)){$id=$_SESSION['pending']??0;$u=$id?one('SELECT * FROM users WHERE id=?',[$id]):null;if(!$u||!$u['active']||time()-($_SESSION['pending_at']??0)>600||(int)$u['session_version']!==($_SESSION['version']??0))fail(401,'auth');if($a==='enroll'){if($u['mfa_secret'])fail(403,'forbidden');if(empty($_SESSION['enroll']))$_SESSION['enroll']=b32(random_bytes(20));$s=$_SESSION['enroll'];ok(['secret'=>$s,'uri'=>'otpauth://totp/'.rawurlencode('APS Order:'.$u['email']).'?secret='.$s.'&issuer=APS%20Order&algorithm=SHA1&digits=6&period=30']);}rate('otp-user',(string)$id,8,600);$code=text($d,'code',40);if($a==='confirm-enroll'){$s=$_SESSION['enroll']??'';$step=intdiv(time(),30);$match=null;foreach([$step,$step-1,$step+1]as$n)if(hash_equals(totp($s,$n),str_replace(' ','',$code)))$match=$n;if($match===null)fail(401,'otp');db()->beginTransaction();if(q('UPDATE users SET mfa_secret=?,mfa_counter=? WHERE id=? AND mfa_secret IS NULL',[seal($s),$match,$id])->rowCount()!==1){db()->rollBack();fail(409,'conflict');}$codes=recovery((int)$id);db()->commit();$u=one('SELECT * FROM users WHERE id=?',[$id]);login_user($u);ok(['user'=>pub($u),'csrf'=>$_SESSION['csrf'],'recovery_codes'=>$codes]);}if(!otp($u,$code))fail(401,'otp');login_user($u);ok(['user'=>pub($u),'csrf'=>$_SESSION['csrf']]);}
 if($a==='logout'){$_SESSION=[];session_destroy();setcookie(session_name(),'', ['expires'=>time()-3600,'path'=>'/','secure'=>!local_mode(),'httponly'=>true,'samesite'=>'Strict']);ok();}

 // ---- Staff workspace ---------------------------------------------------
 $u=session_user();
 if($a==='dashboard'){
  $isP=$u['role']==='platform_admin';$ids=$isP?[]:[$u['restaurant_id']];$where=$isP?'':' WHERE restaurant_id=?';$owhere=$isP?'':' AND o.restaurant_id=?';$since=time()-86400*30;
  $res=['user'=>pub($u),'csrf'=>$_SESSION['csrf'],'now'=>time(),
   'restaurants'=>$isP?all('SELECT * FROM restaurants ORDER BY id DESC'):all('SELECT * FROM restaurants WHERE id=?',[$u['restaurant_id']]),
   'categories'=>all('SELECT * FROM categories'.$where.' ORDER BY sort_order,id',$ids),
   'items'=>all('SELECT * FROM items'.$where.' ORDER BY sort_order,id',$ids),
   'tables'=>all('SELECT * FROM dining_tables'.$where.' ORDER BY label',$ids),
   'orders'=>all('SELECT o.id,o.public_id,o.restaurant_id,o.table_id,o.order_type,o.guest_count,o.customer_name,o.customer_note,o.allergies,o.status,o.payment_method,o.payment_status,o.subtotal,o.tax,o.service,o.total,o.created_by,o.rating,o.created_at,o.updated_at,t.label AS table_label,w.name AS created_by_name,(SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE order_id=o.id) AS item_count FROM orders o LEFT JOIN dining_tables t ON t.id=o.table_id LEFT JOIN users w ON w.id=o.created_by WHERE 1=1'.$owhere.' ORDER BY o.id DESC LIMIT 500',$ids),
   'calls'=>all('SELECT s.id,s.restaurant_id,s.table_id,s.kind,s.created_at,t.label AS table_label,t.zone FROM service_requests s JOIN dining_tables t ON t.id=s.table_id WHERE s.resolved_at IS NULL'.($isP?'':' AND s.restaurant_id=?').' ORDER BY s.created_at',$ids),
   'top_items'=>all("SELECT oi.item_name,SUM(oi.quantity) AS quantity,SUM(oi.quantity*oi.unit_price) AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status<>'cancelled' AND o.created_at>=?".$owhere.' GROUP BY oi.item_id ORDER BY quantity DESC LIMIT 8',array_merge([$since],$ids)),
   'feedback'=>all('SELECT o.id,o.public_id,o.restaurant_id,o.rating,o.rating_comment,o.rated_at,t.label AS table_label FROM orders o LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.rating IS NOT NULL AND o.rated_at>=?'.$owhere.' ORDER BY o.rated_at DESC LIMIT 60',array_merge([$since],$ids))];
  if($u['role']!=='staff'){$res['screens']=all('SELECT id,restaurant_id,name,pin,pin_expires_at,(token_hash IS NOT NULL) AS paired,last_seen,created_at FROM screens'.$where.' ORDER BY id',$ids);$res['signage']=all('SELECT * FROM signage_content'.$where.' ORDER BY sort_order,id',$ids);$res['signage_targets']=all('SELECT st.content_id,st.screen_id FROM signage_targets st JOIN signage_content c ON c.id=st.content_id'.($isP?'':' WHERE c.restaurant_id=?'),$ids);}
  if($u['role']!=='staff')$res['users']=$isP?all('SELECT id,name,email,role,restaurant_id,active,(password_hash IS NOT NULL) activated,(mfa_secret IS NOT NULL)mfa_enabled FROM users ORDER BY id DESC'):all('SELECT id,name,email,role,restaurant_id,active,(password_hash IS NOT NULL) activated,(mfa_secret IS NOT NULL)mfa_enabled FROM users WHERE restaurant_id=?',[$u['restaurant_id']]);
  $res['mfa_required']=MFA_REQUIRED;if($isP)$res['audit']=all('SELECT * FROM audit ORDER BY id DESC LIMIT 100');
  ok($res);
 }
 rate('write-user',(string)$u['id'],150,300);
 if($a==='security-change'){$current=rawpass($d,'current_password');if(!$u['password_hash']||!password_verify($current,$u['password_hash']))fail(401,'credentials');$next=pass($d,'new_password');if(password_verify($next,$u['password_hash']))fail(422,'password_policy');q('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',[phash($next),$u['id']]);audit('password_changed',$u,'user',(int)$u['id']);$_SESSION=[];session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));ok(['csrf'=>$_SESSION['csrf']]);}
 if($a==='recovery-regenerate'){$current=rawpass($d,'password');if(!$u['password_hash']||!password_verify($current,$u['password_hash']))fail(401,'credentials');db()->beginTransaction();$codes=recovery((int)$u['id']);audit('recovery_codes_regenerated',$u,'user',(int)$u['id']);db()->commit();ok(['recovery_codes'=>$codes]);}
 if($a==='order-detail'){$o=owns('orders',num($d,'id'),$u);unset($o['status_token']);$t=$o['table_id']?one('SELECT label,zone FROM dining_tables WHERE id=?',[$o['table_id']]):null;$o['table_label']=$t['label']??null;$o['table_zone']=$t['zone']??null;$o['created_by_name']=$o['created_by']?one('SELECT name FROM users WHERE id=?',[$o['created_by']])['name']??null:null;ok(['order'=>$o,'items'=>all('SELECT id,item_id,item_name,unit_price,quantity,guest_name,note,allergens FROM order_items WHERE order_id=? ORDER BY id',[$o['id']])]);}
 if($a==='order-update'){$o=owns('orders',num($d,'id'),$u);$status=choice($d,'status',['new','confirmed','preparing','ready','served','cancelled'],$o['status']);$pay=choice($d,'payment_status',['pending','paid','refunded','failed'],$o['payment_status']);q('UPDATE orders SET status=?,payment_status=?,updated_at=? WHERE id=?',[$status,$pay,time(),$o['id']]);audit('order_updated',$u,'order',(int)$o['id']);ok();}
 if($a==='call-resolve'){$c=owns('service_requests',num($d,'id'),$u);q('UPDATE service_requests SET resolved_at=?,resolved_by=? WHERE id=? AND resolved_at IS NULL',[time(),$u['id'],$c['id']]);ok();}
 if($a==='staff-order-create'){
  // Reception and waiters: same pricing as customers, the order skips "new" because a person already took it.
  $r=owns('restaurants',rid($u,$d),$u);if(!subscribed($r))fail(409,'orders_closed');
  $type=choice($d,'order_type',['table','counter','takeaway']);$table=null;if($type==='table'){$table=owns('dining_tables',num($d,'table_id'),$u);if((int)$table['restaurant_id']!==(int)$r['id']||!(int)$table['active'])fail(422,'table');}
  $pay=$type==='table'?choice($d,'payment_method',['table','counter'],'table'):'counter';
  $o=place_order($r,$d,$table,$type,$pay,'confirmed',(int)$u['id'],!empty($d['paid']));audit('staff_order_created',$u,'order',$o['id']);ok($o+['slug'=>$r['slug']]);
 }
 if($u['role']==='staff')fail(403,'forbidden');
 if($a==='category-save'){$id=num($d,'id',true);$restaurant=rid($u,$d);$f=[text($d,'name_fr',120),text($d,'name_en',120,false),text($d,'name_ar',120,false),text($d,'name_es',120,false),text($d,'name_de',120,false),text($d,'name_zh',120,false),intrange($d,'sort_order',-100000,100000),!empty($d['active'])?1:0];if($id){$old=owns('categories',$id,$u);if((int)$old['restaurant_id']!==$restaurant)fail(422,'validation');q('UPDATE categories SET name_fr=?,name_en=?,name_ar=?,name_es=?,name_de=?,name_zh=?,sort_order=?,active=? WHERE id=?',[...$f,$id]);}else{q('INSERT INTO categories(restaurant_id,name_fr,name_en,name_ar,name_es,name_de,name_zh,sort_order,active)VALUES(?,?,?,?,?,?,?,?,?)',[$restaurant,...$f]);$id=(int)db()->lastInsertId();}audit('category_saved',$u,'category',$id);ok(['id'=>$id]);}
 if($a==='item-save'){$id=num($d,'id',true);$restaurant=rid($u,$d);$cat=num($d,'category_id');if(!one('SELECT id FROM categories WHERE id=? AND restaurant_id=?',[$cat,$restaurant]))fail(422,'validation');$price=intrange($d,'price',0,100000000,-1);$allergens=$d['allergens']??[];if(!is_array($allergens)||count($allergens)>20)fail(422,'validation');foreach($allergens as$x)if(!in_array($x,ALLERGENS,true))fail(422,'validation');$f=[$cat,text($d,'name_fr',160),text($d,'name_en',160,false),text($d,'name_ar',160,false),text($d,'name_es',160,false),text($d,'name_de',160,false),text($d,'name_zh',160,false),text($d,'description_fr',1000,false),text($d,'description_en',1000,false),text($d,'description_ar',1000,false),text($d,'description_es',1000,false),text($d,'description_de',1000,false),text($d,'description_zh',1000,false),$price,json_encode(array_values(array_unique($allergens))),!empty($d['available'])?1:0,!empty($d['featured'])?1:0,intrange($d,'sort_order',-100000,100000)];if($id){$old=owns('items',$id,$u);if((int)$old['restaurant_id']!==$restaurant)fail(422,'validation');q('UPDATE items SET category_id=?,name_fr=?,name_en=?,name_ar=?,name_es=?,name_de=?,name_zh=?,description_fr=?,description_en=?,description_ar=?,description_es=?,description_de=?,description_zh=?,price=?,allergens=?,available=?,featured=?,sort_order=? WHERE id=?',[...$f,$id]);}else{q('INSERT INTO items(restaurant_id,category_id,name_fr,name_en,name_ar,name_es,name_de,name_zh,description_fr,description_en,description_ar,description_es,description_de,description_zh,price,allergens,available,featured,sort_order,created_at)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$restaurant,...$f,time()]);$id=(int)db()->lastInsertId();}audit('item_saved',$u,'item',$id);ok(['id'=>$id]);}
 if($a==='item-availability'){$it=owns('items',num($d,'id'),$u);q('UPDATE items SET available=? WHERE id=?',[(int)!$it['available'],$it['id']]);audit('item_availability',$u,'item',(int)$it['id']);ok();}
 if($a==='table-save'){$id=num($d,'id',true);$restaurant=rid($u,$d);$label=text($d,'label',80);$seats=min(100,num($d,'seats'));$zone=text($d,'zone',80,false);if($id){$old=owns('dining_tables',$id,$u);if((int)$old['restaurant_id']!==$restaurant)fail(422,'validation');q('UPDATE dining_tables SET label=?,seats=?,zone=?,active=? WHERE id=?',[$label,$seats,$zone,!empty($d['active'])?1:0,$id]);}else{if(one('SELECT id FROM dining_tables WHERE restaurant_id=? AND label=?',[$restaurant,$label]))fail(409,'exists');q('INSERT INTO dining_tables(restaurant_id,label,seats,zone,access_token)VALUES(?,?,?,?,?)',[$restaurant,$label,$seats,$zone,bin2hex(random_bytes(18))]);$id=(int)db()->lastInsertId();}audit('table_saved',$u,'table',$id);ok(['id'=>$id]);}
 if($a==='restaurant-toggle-orders'){$r=owns('restaurants',num($d,'id'),$u);q('UPDATE restaurants SET accepting_orders=? WHERE id=?',[(int)!$r['accepting_orders'],$r['id']]);audit('orders_toggled',$u,'restaurant',(int)$r['id']);ok();}
 if($a==='restaurant-settings'){
  $r=owns('restaurants',num($d,'id'),$u);$url=text($d,'google_review_url',500,false);if($url!==''&&(!filter_var($url,FILTER_VALIDATE_URL)||!preg_match('#^https://#i',$url)))fail(422,'validation');
  $l=$d['languages']??[];if(!is_array($l))fail(422,'validation');foreach($l as$x)if(!is_string($x)||!in_array($x,LANGS,true))fail(422,'validation');$l=array_values(array_intersect(LANGS,array_merge(['fr'],$l)));$def=in_array($d['default_language']??'',$l,true)?$d['default_language']:'fr';
  q('UPDATE restaurants SET google_review_url=?,languages=?,default_language=? WHERE id=?',[$url,json_encode($l),$def,$r['id']]);audit('restaurant_settings',$u,'restaurant',(int)$r['id']);ok();
 }
 if($a==='screen-save'){$id=num($d,'id',true);$restaurant=rid($u,$d);$name=text($d,'name',80);if($id){$old=owns('screens',$id,$u);if((int)$old['restaurant_id']!==$restaurant)fail(422,'validation');q('UPDATE screens SET name=? WHERE id=?',[$name,$id]);}else{if((int)one('SELECT COUNT(*) n FROM screens WHERE restaurant_id=?',[$restaurant])['n']>=30)fail(409,'limit');q('INSERT INTO screens(restaurant_id,name,pin,pin_expires_at,created_at)VALUES(?,?,?,?,?)',[$restaurant,$name,new_pin(),time()+86400,time()]);$id=(int)db()->lastInsertId();}audit('screen_saved',$u,'screen',$id);ok(['id'=>$id]);}
 if($a==='screen-pin'){$s=owns('screens',num($d,'id'),$u);q('UPDATE screens SET pin=?,pin_expires_at=?,token_hash=NULL WHERE id=?',[new_pin(),time()+86400,$s['id']]);audit('screen_unpaired',$u,'screen',(int)$s['id']);ok();}
 if($a==='screen-delete'){$s=owns('screens',num($d,'id'),$u);db()->beginTransaction();q('DELETE FROM signage_targets WHERE screen_id=?',[$s['id']]);q('DELETE FROM screens WHERE id=?',[$s['id']]);db()->commit();audit('screen_deleted',$u,'screen',(int)$s['id']);ok();}
 if($a==='signage-save'){
  $c=owns('signage_content',num($d,'id'),$u);$start=($d['start_date']??'')===''?null:datev($d,'start_date');$end=($d['end_date']??'')===''?null:datev($d,'end_date');if($start&&$end&&$end<$start)fail(422,'validation');
  $targets=$d['screens']??[];if(!is_array($targets)||count($targets)>30)fail(422,'validation');$ids=[];foreach($targets as$sid){$s=owns('screens',num(['v'=>$sid],'v'),$u);if((int)$s['restaurant_id']!==(int)$c['restaurant_id'])fail(422,'validation');$ids[]=(int)$s['id'];}
  db()->beginTransaction();q('UPDATE signage_content SET title=?,duration=?,start_date=?,end_date=?,active=?,sort_order=? WHERE id=?',[text($d,'title',120,false),intrange($d,'duration',3,600,10),$start,$end,!empty($d['active'])?1:0,intrange($d,'sort_order',-100000,100000),$c['id']]);q('DELETE FROM signage_targets WHERE content_id=?',[$c['id']]);foreach($ids?array_unique($ids):[null]as$sid)q('INSERT INTO signage_targets(content_id,screen_id)VALUES(?,?)',[$c['id'],$sid]);db()->commit();
  audit('signage_saved',$u,'signage',(int)$c['id']);ok();
 }
 if($a==='signage-delete'){$c=owns('signage_content',num($d,'id'),$u);db()->beginTransaction();q('DELETE FROM signage_targets WHERE content_id=?',[$c['id']]);q('DELETE FROM signage_content WHERE id=?',[$c['id']]);db()->commit();$prefix='/uploads/'.(int)$c['restaurant_id'].'/signage/';if(str_starts_with($c['path'],$prefix)&&preg_match('#^[a-f0-9]{32}\.(webp|mp4|webm)$#',substr($c['path'],strlen($prefix))))@unlink(__DIR__.$c['path']);audit('signage_deleted',$u,'signage',(int)$c['id']);ok();}
 if($a==='invite'){$restaurant=rid($u,$d);$role=$u['role']==='platform_admin'?choice($d,'role',['restaurant_admin','staff']):'staff';$em=email($d);if(one('SELECT id FROM users WHERE email=?',[$em]))fail(409,'exists');q('INSERT INTO users(email,name,role,restaurant_id,created_at)VALUES(?,?,?,?,?)',[$em,text($d,'name',120),$role,$restaurant,time()]);$id=(int)db()->lastInsertId();$sent=send_link(one('SELECT * FROM users WHERE id=?',[$id]));audit('user_invited',$u,'user',$id);ok(['mail_sent'=>$sent]);}
 if($a==='user-toggle'){$id=num($d,'id');$target=one('SELECT * FROM users WHERE id=?',[$id]);if(!$target||$target['role']==='platform_admin'||($u['role']!=='platform_admin'&&(int)$target['restaurant_id']!==(int)$u['restaurant_id']))fail(403,'forbidden');q('UPDATE users SET active=?,session_version=session_version+1 WHERE id=?',[(int)!$target['active'],$id]);audit('user_access_changed',$u,'user',$id);ok();}
 platform($u);
 if($a==='restaurant-save'){$id=num($d,'id',true);$slug=strtolower(text($d,'slug',80));if(!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/',$slug))fail(422,'validation');$clash=one('SELECT id FROM restaurants WHERE slug=?',[$slug]);if($clash&&(int)$clash['id']!==(int)$id)fail(409,'exists');$end=datev($d,'subscription_end');$tax=intrange($d,'tax_rate',0,10000);$service=intrange($d,'service_rate',0,10000);$f=[text($d,'name',160),$slug,choice($d,'currency',['MAD','EUR','USD']),choice($d,'subscription_plan',['Starter','Growth','Premium','Custom']),choice($d,'subscription_status',['trial','active','past_due','suspended','cancelled']),$end,$tax,$service];if($id){owns('restaurants',$id,$u);q('UPDATE restaurants SET name=?,slug=?,currency=?,subscription_plan=?,subscription_status=?,subscription_end=?,tax_rate=?,service_rate=? WHERE id=?',[...$f,$id]);}else{q('INSERT INTO restaurants(name,slug,currency,subscription_plan,subscription_status,subscription_end,tax_rate,service_rate,created_at)VALUES(?,?,?,?,?,?,?,?,?)',[...$f,time()]);$id=(int)db()->lastInsertId();}audit('restaurant_saved',$u,'restaurant',$id);ok(['id'=>$id]);}
 fail(404,'not_found');
}catch(Throwable$e){try{if(db()->inTransaction())db()->rollBack();}catch(Throwable$ignore){}log_error('api',$e);fail(503,'unavailable');}
