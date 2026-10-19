<?php
declare(strict_types=1); umask(0077);
const ORIGIN='https://order.apservices.vip';
const SCHEMA_VERSION=2;
const SESSION_IDLE=1200;      // 20 min without any request
const SESSION_MAX=50400;      // 14 h: covers a full service day on a kitchen screen
const BACKUP_KEEP=14;         // daily database snapshots kept in var/backups
const MFA_REQUIRED=false;     // two-step verification switched off for now; set to true to require it again (saved secrets are kept)
const PLATFORM_ADMINS=['mohammad@apservices.vip'=>'Mohammad','oussama@apservices.vip'=>'Oussama'];
const ALLERGENS=['gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs'];

function local_mode():bool{return getenv('APS_ORDER_ENV')==='test'&&PHP_SAPI==='cli-server'&&in_array($_SERVER['SERVER_ADDR']??'127.0.0.1',['127.0.0.1','::1'],true);}
function store_dir():string{return local_mode()&&getenv('APS_ORDER_TEST_DIR')?(string)getenv('APS_ORDER_TEST_DIR'):dirname(__DIR__).'/var';}
function client_ip():string{return (string)($_SERVER['REMOTE_ADDR']??'unknown');}

function db():PDO{
 static $d;if(isset($d))return $d;
 $dir=store_dir();if(!is_dir($dir)&&!mkdir($dir,0700,true))throw new RuntimeException('storage');
 if(!is_file($dir.'/.htaccess'))file_put_contents($dir.'/.htaccess',"Require all denied\n");
 $d=new PDO('sqlite:'.$dir.'/orders.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
 $d->exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;');
 // Run the schema only when it changed, not on every request.
 if((int)$d->query('PRAGMA user_version')->fetchColumn()<SCHEMA_VERSION){
  $d->exec(file_get_contents(__DIR__.'/schema.sql'));
  foreach(PLATFORM_ADMINS as $email=>$name)q("INSERT OR IGNORE INTO users(email,name,role,created_at)VALUES(?,?,'platform_admin',?)",[$email,$name,time()]);
  $d->exec('PRAGMA user_version='.SCHEMA_VERSION);
 }
 @chmod($dir.'/orders.sqlite',0600);return $d;
}
function q(string $s,array $p=[]):PDOStatement{$x=db()->prepare($s);$x->execute($p);return $x;} function one(string $s,array $p=[]):?array{$r=q($s,$p)->fetch();return$r?:null;}function all(string $s,array $p=[]):array{return q($s,$p)->fetchAll();}

// Once a day: snapshot the database and clear expired rows and old session files.
function maintenance():void{
 $dir=store_dir();$today=date('Y-m-d');$stamp=$dir.'/.maintenance';
 if(@file_get_contents($stamp)===$today)return;
 $lock=@fopen($dir.'/.maintenance.lock','c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))return;
 try{
  if(@file_get_contents($stamp)===$today)return;
  $bd=$dir.'/backups';if(!is_dir($bd))mkdir($bd,0700);
  $file=$bd.'/orders-'.$today.'.sqlite';
  if(!is_file($file)){
   try{db()->exec('VACUUM INTO '.db()->quote($file));}
   catch(Throwable $e){db()->exec('PRAGMA wal_checkpoint(TRUNCATE)');copy($dir.'/orders.sqlite',$file);}
   @chmod($file,0600);
  }
  $snaps=glob($bd.'/orders-*.sqlite')?:[];sort($snaps);
  foreach(array_slice($snaps,0,max(0,count($snaps)-BACKUP_KEEP))as$old)@unlink($old);
  $now=time();
  q('DELETE FROM rate_limits WHERE expires_at<?',[$now]);
  q('DELETE FROM tokens WHERE expires_at<?',[$now-86400*30]);
  q('DELETE FROM service_requests WHERE resolved_at IS NOT NULL AND created_at<?',[$now-86400*30]);
  q('DELETE FROM audit WHERE created_at<?',[$now-86400*365]);
  foreach(glob($dir.'/sessions/sess_*')?:[]as$s)if(@filemtime($s)<$now-SESSION_MAX-3600)@unlink($s);
  file_put_contents($stamp,$today);
 }catch(Throwable $e){log_error('maintenance',$e);}
 finally{flock($lock,LOCK_UN);fclose($lock);}
}
function log_error(string $where,Throwable $e):void{error_log('APS Order '.$where.' '.get_class($e).': '.$e->getMessage().' @ '.basename($e->getFile()).':'.$e->getLine());}

function out(int $n,array $d):never{http_response_code($n);echo json_encode($d,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit;}function ok(array $d=[]):never{out(200,['ok'=>true]+$d);}function fail(int $n,string $e):never{out($n,['ok'=>false,'error'=>$e]);}
function text(array $d,string $k,int $max=200,bool $req=true):string{$v=$d[$k]??'';if(!is_string($v)||!preg_match('//u',$v)||str_contains($v,"\0"))fail(422,'validation');$v=trim($v);$len=preg_match_all('/./us',$v);if(($req&&$len<1)||$len>$max)fail(422,'validation');return$v;}
function email(array $d):string{$v=strtolower(text($d,'email',254));if(!filter_var($v,FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n]/',$v))fail(422,'validation');return$v;}function num(array $d,string $k,bool $null=false):?int{$v=$d[$k]??null;if($null&&($v===null||$v===''))return null;if(filter_var($v,FILTER_VALIDATE_INT)===false||(int)$v<1)fail(422,'validation');return(int)$v;}function choice(array$d,string$k,array$a,string$def=''):string{$v=$d[$k]??$def;if(!is_string($v)||!in_array($v,$a,true))fail(422,'validation');return$v;}function datev(array$d,string$k):string{$s=text($d,$k,10);$x=DateTimeImmutable::createFromFormat('!Y-m-d',$s);if(!$x||$x->format('Y-m-d')!==$s)fail(422,'validation');return$s;}
function intrange(array $d,string $k,int $min,int $max,int $def=0):int{$v=$d[$k]??$def;if(filter_var($v,FILTER_VALIDATE_INT)===false||(int)$v<$min||(int)$v>$max)fail(422,'validation');return(int)$v;}
function rate(string$n,string$k,int$m,int$sec):void{$b=hash('sha256',$n.'|'.$k);$now=time();q('INSERT INTO rate_limits(bucket,hits,expires_at)VALUES(?,1,?) ON CONFLICT(bucket)DO UPDATE SET hits=CASE WHEN expires_at<? THEN 1 ELSE hits+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END',[$b,$now+$sec,$now,$now]);$r=one('SELECT * FROM rate_limits WHERE bucket=?',[$b]);if((int)$r['hits']>$m){header('Retry-After: '.max(1,(int)$r['expires_at']-$now));fail(429,'rate');}}
function pass(array$d,string$k='password'):string{$p=$d[$k]??'';if(!is_string($p)||strlen($p)<15||strlen($p)>128||str_contains($p,"\0")||count(array_unique(str_split($p)))<5)fail(422,'password_policy');foreach(['password','123456789','qwerty','apservices','restaurant','letmein']as$w)if(str_contains(strtolower($p),$w))fail(422,'password_policy');return$p;}function rawpass(array$d,string$k):string{$p=$d[$k]??null;if(!is_string($p)||strlen($p)>128||str_contains($p,"\0"))fail(422,'validation');return$p;}function phash(string$p):string{return defined('PASSWORD_ARGON2ID')?password_hash($p,PASSWORD_ARGON2ID,['memory_cost'=>19456,'time_cost'=>2,'threads'=>1]):password_hash($p,PASSWORD_BCRYPT,['cost'=>12]);}
function keyv():string{$f=store_dir().'/app.key';if(!is_file($f)){$h=@fopen($f,'x');if($h){fwrite($h,random_bytes(32));fclose($h);chmod($f,0600);}}$k=file_get_contents($f);if(strlen($k)!==32)throw new RuntimeException('key');return$k;}function seal(string$v):string{$iv=random_bytes(12);$tag='';$x=openssl_encrypt($v,'aes-256-gcm',keyv(),OPENSSL_RAW_DATA,$iv,$tag,'APS-Order',16);if($x===false)throw new RuntimeException('crypt');return base64_encode($iv.$tag.$x);}function openv(string$v):string{$r=base64_decode($v,true);$x=$r===false?false:openssl_decrypt(substr($r,28),'aes-256-gcm',keyv(),OPENSSL_RAW_DATA,substr($r,0,12),substr($r,12,16),'APS-Order');if($x===false)throw new RuntimeException('crypt');return$x;}
function b32(string$b):string{$a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$bits='';foreach(str_split($b)as$c)$bits.=str_pad(decbin(ord($c)),8,'0',STR_PAD_LEFT);$o='';foreach(str_split($bits,5)as$x)$o.=$a[bindec(str_pad($x,5,'0'))];return$o;}function ub32(string$s):string{$a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$bits='';foreach(str_split($s)as$c){$i=strpos($a,$c);if($i===false)throw new RuntimeException('b32');$bits.=str_pad(decbin($i),5,'0',STR_PAD_LEFT);}$o='';foreach(str_split($bits,8)as$x)if(strlen($x)===8)$o.=chr(bindec($x));return$o;}function totp(string$s,int$c):string{$h=hash_hmac('sha1',pack('N2',0,$c),ub32($s),true);$o=ord($h[19])&15;$n=unpack('N',substr($h,$o,4))[1]&0x7fffffff;return str_pad((string)($n%1000000),6,'0',STR_PAD_LEFT);}
function otp(array$u,string$c):bool{$c=str_replace([' ','-'],'',trim($c));if(preg_match('/^\d{6}$/',$c)&&$u['mfa_secret']){$s=openv($u['mfa_secret']);$step=intdiv(time(),30);foreach([$step,$step-1,$step+1]as$n)if($n>(int)$u['mfa_counter']&&hash_equals(totp($s,$n),$c))return q('UPDATE users SET mfa_counter=? WHERE id=? AND mfa_counter<?',[$n,$u['id'],$n])->rowCount()===1;}if(preg_match('/^[a-f0-9]{20}$/i',$c))return q('UPDATE recovery_codes SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL',[time(),$u['id'],hash('sha256',strtolower($c))])->rowCount()===1;return false;}
function recovery(int$id):array{$a=[];q('DELETE FROM recovery_codes WHERE user_id=?',[$id]);for($i=0;$i<10;$i++){$x=bin2hex(random_bytes(10));$a[]=implode('-',str_split($x,5));q('INSERT INTO recovery_codes(user_id,code_hash)VALUES(?,?)',[$id,hash('sha256',$x)]);}return$a;}
function mailx(string$to,string$sub,string$body):bool{if(local_mode()){$dir=store_dir().'/outbox';if(!is_dir($dir))mkdir($dir,0700);file_put_contents($dir.'/'.bin2hex(random_bytes(8)).'.json',json_encode(compact('to','sub','body')));return true;}return mail($to,'=?UTF-8?B?'.base64_encode($sub).'?=',chunk_split(base64_encode($body)),['From'=>'APS Order <contact@apservices.vip>','MIME-Version'=>'1.0','Content-Type'=>'text/plain; charset=UTF-8','Content-Transfer-Encoding'=>'base64'],'-fcontact@apservices.vip');}
function send_link(array$u):bool{$t=bin2hex(random_bytes(32));$now=time();db()->beginTransaction();q('UPDATE tokens SET used_at=? WHERE user_id=? AND used_at IS NULL',[$now,$u['id']]);q('INSERT INTO tokens(user_id,token_hash,expires_at,created_at)VALUES(?,?,?,?)',[$u['id'],hash('sha256',$t),$now+1800,$now]);db()->commit();$url=(local_mode()?'http://127.0.0.1:4190':ORIGIN).'/staff/#activate='.$t;return mailx($u['email'],'APS Order — accès au compte / account access',"Bonjour / Hello ".$u['name'].",\n\nActivez ou réinitialisez votre compte APS Order (lien unique, 30 minutes) :\nActivate or reset your APS Order account (single-use, 30 minutes):\n\n$url\n\nUne application d’authentification est obligatoire. / An authenticator app is required.\n\nAPS Order — ".ORIGIN);}
function audit(string$e,?array$u=null,string$entity='',?int$id=null):void{q('INSERT INTO audit(user_id,restaurant_id,event,entity,entity_id,created_at)VALUES(?,?,?,?,?,?)',[$u['id']??null,$u['restaurant_id']??null,$e,$entity,$id,time()]);}
function session_user(bool$required=true):?array{$id=$_SESSION['uid']??null;if(!$id){if($required)fail(401,'auth');return null;}$u=one('SELECT * FROM users WHERE id=?',[$id]);$now=time();if(!$u||!(int)$u['active']||(MFA_REQUIRED&&!$u['mfa_secret'])||$now-($_SESSION['last']??0)>SESSION_IDLE||$now-($_SESSION['created']??0)>SESSION_MAX||(int)$u['session_version']!==($_SESSION['version']??0)){$_SESSION=[];session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));if($required)fail(401,'auth');return null;}$_SESSION['last']=$now;return$u;}function login_user(array$u):void{session_regenerate_id(true);$_SESSION=['uid'=>(int)$u['id'],'version'=>(int)$u['session_version'],'created'=>time(),'last'=>time(),'csrf'=>bin2hex(random_bytes(32))];audit('login',$u);}function pub(array$u):array{return array_intersect_key($u,array_flip(['id','name','email','role','restaurant_id']));}function platform(array$u):void{if($u['role']!=='platform_admin')fail(403,'forbidden');}function rid(array$u,array$d):int{if($u['role']!=='platform_admin')return(int)$u['restaurant_id'];$id=num($d,'restaurant_id');if(!one('SELECT id FROM restaurants WHERE id=?',[$id]))fail(422,'validation');return$id;}function owns(string$table,int$id,array$u):array{if(!in_array($table,['restaurants','categories','items','dining_tables','orders','service_requests'],true))throw new RuntimeException('table');$r=one("SELECT * FROM $table WHERE id=?",[$id]);$restaurant=$table==='restaurants'?$r['id']??0:$r['restaurant_id']??0;if(!$r||($u['role']!=='platform_admin'&&(int)$restaurant!==(int)$u['restaurant_id']))fail(404,'not_found');return$r;}
function open_restaurant(string $slug):?array{$r=one('SELECT * FROM restaurants WHERE slug=?',[$slug]);if(!$r||!in_array($r['subscription_status'],['trial','active'],true)||$r['subscription_end']<date('Y-m-d'))return null;return$r;}
