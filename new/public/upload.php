<?php
declare(strict_types=1);ini_set('display_errors','0');require dirname(__DIR__).'/app/core.php';
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
// Public upload folders: umask(0077) in core.php would make them 0700, which the web server cannot read on shared hosting.
function pubdir(string $rel):string{$dir=__DIR__;foreach(explode('/',trim($rel,'/'))as$part){$dir.='/'.$part;if(!is_dir($dir)&&!mkdir($dir,0755))throw new RuntimeException('storage');@chmod($dir,0755);}return$dir;}
// Re-encodes an uploaded picture to WebP (drops metadata and anything hidden in the file); returns the public path.
function webp(array $f,int $min,int $max,string $rel):string{
 $info=@getimagesize($f['tmp_name']);if(!$info||$info[0]<$min||$info[1]<$min||$info[0]*$info[1]>20000000||!in_array($info['mime'],['image/jpeg','image/png','image/webp'],true))fail(422,'image');
 $src=match($info['mime']){'image/jpeg'=>@imagecreatefromjpeg($f['tmp_name']),'image/png'=>@imagecreatefrompng($f['tmp_name']),'image/webp'=>@imagecreatefromwebp($f['tmp_name'])};if(!$src)fail(422,'image');$scale=min(1,$max/max($info[0],$info[1]));$w=max(1,(int)round($info[0]*$scale));$h=max(1,(int)round($info[1]*$scale));$dst=imagecreatetruecolor($w,$h);imagealphablending($dst,false);imagesavealpha($dst,true);imagecopyresampled($dst,$src,0,0,0,0,$w,$h,$info[0],$info[1]);
 $dir=pubdir($rel);$name=bin2hex(random_bytes(16)).'.webp';if(!imagewebp($dst,$dir.'/'.$name,82))throw new RuntimeException('image');imagedestroy($src);imagedestroy($dst);chmod($dir.'/'.$name,0644);return$rel.'/'.$name;
}
try{
 if(!local_mode()&&(($_SERVER['HTTPS']??'')!=='on'||strtolower($_SERVER['HTTP_HOST']??'')!=='order.apservices.vip'))fail(400,'host');
 if(($_SERVER['REQUEST_METHOD']??'')!=='POST')fail(405,'method');
 // PHP drops $_POST and $_FILES entirely when the body is over post_max_size, so say "too large" instead of "csrf".
 if(!$_POST&&!$_FILES&&(int)($_SERVER['CONTENT_LENGTH']??0)>0)fail(413,'too_large');
 db();$sd=store_dir().'/sessions';if(!is_dir($sd))mkdir($sd,0700);session_save_path($sd);ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');ini_set('session.gc_maxlifetime',(string)SESSION_MAX);session_name(local_mode()?'APS_ORDER_TEST':'__Host-APSORDER');session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>!local_mode(),'httponly'=>true,'samesite'=>'Strict']);session_start();
 $origin=$_SERVER['HTTP_ORIGIN']??'';if($origin!==''&&!in_array($origin,local_mode()?['http://127.0.0.1:4190']:[ORIGIN],true))fail(403,'csrf');$token=$_POST['csrf']??'';if(!is_string($token)||!isset($_SESSION['csrf'])||!hash_equals($_SESSION['csrf'],$token))fail(403,'csrf');
 $u=session_user();if($u['role']==='staff')fail(403,'forbidden');rate('upload-user',(string)$u['id'],40,3600);$kind=$_POST['kind']??'item';
 $f=$_FILES['image']??$_FILES['file']??null;if($f&&in_array($f['error'],[UPLOAD_ERR_INI_SIZE,UPLOAD_ERR_FORM_SIZE],true))fail(413,'too_large');
 if(!$f||$f['error']!==UPLOAD_ERR_OK||$f['size']<1||!is_uploaded_file($f['tmp_name']))fail(422,'image');
 if($kind==='item'){
  if($f['size']>3145728)fail(422,'image');$id=filter_var($_POST['item_id']??null,FILTER_VALIDATE_INT);if(!$id)fail(422,'validation');$item=owns('items',(int)$id,$u);
  $path=webp($f,200,1400,'/uploads/'.(int)$item['restaurant_id']);q('UPDATE items SET image_path=? WHERE id=?',[$path,$item['id']]);audit('item_image_updated',$u,'item',(int)$item['id']);ok(['image_path'=>$path]);
 }
 if($kind==='logo'){
  if($f['size']>3145728)fail(422,'image');$id=filter_var($_POST['restaurant_id']??null,FILTER_VALIDATE_INT);if(!$id)fail(422,'validation');$r=owns('restaurants',(int)$id,$u);
  $path=webp($f,64,800,'/uploads/'.(int)$r['id']);q('UPDATE restaurants SET logo_path=? WHERE id=?',[$path,$r['id']]);audit('logo_updated',$u,'restaurant',(int)$r['id']);ok(['logo_path'=>$path]);
 }
 if($kind==='signage'){
  $id=filter_var($_POST['restaurant_id']??null,FILTER_VALIDATE_INT);if(!$id)fail(422,'validation');$r=owns('restaurants',(int)$id,$u);$rel='/uploads/'.(int)$r['id'].'/signage';
  $used=one('SELECT COUNT(*) n,COALESCE(SUM(bytes),0) b FROM signage_content WHERE restaurant_id=?',[$r['id']]);if((int)$used['n']>=100||(int)$used['b']+$f['size']>SIGNAGE_QUOTA)fail(409,'quota');
  // Container signature decides the type (QuickTime .mov is refused: TV browsers rarely play it); fileinfo, when installed, must agree.
  $head=(string)file_get_contents($f['tmp_name'],false,null,0,12);$mime=class_exists('finfo')?(string)(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']):'';
  $ext=substr($head,4,4)==='ftyp'&&substr($head,8,4)!=='qt  '?'mp4':(substr($head,0,4)==="\x1A\x45\xDF\xA3"?'webm':'');
  if($ext&&($mime===''||$mime==='video/'.$ext)){
   if($f['size']>52428800)fail(413,'too_large');
   $dir=pubdir($rel);$path=$rel.'/'.bin2hex(random_bytes(16)).'.'.$ext;if(!move_uploaded_file($f['tmp_name'],__DIR__.$path))throw new RuntimeException('storage');chmod(__DIR__.$path,0644);$type='video';$bytes=(int)$f['size'];
  }elseif(!$ext&&@getimagesize($f['tmp_name'])){
   if($f['size']>15728640)fail(413,'too_large');$path=webp($f,320,1920,$rel);$type='image';$bytes=(int)filesize(__DIR__.$path);
  }else fail(422,'media');
  $title=$_POST['title']??'';if(!is_string($title)||!preg_match('//u',$title))$title='';preg_match('/^.{0,120}/us',trim($title),$m);$title=$m[0]??'';
  $screen=filter_var($_POST['screen_id']??null,FILTER_VALIDATE_INT);if($screen){$s=owns('screens',(int)$screen,$u);if((int)$s['restaurant_id']!==(int)$r['id'])fail(422,'validation');}
  db()->beginTransaction();q('INSERT INTO signage_content(restaurant_id,kind,path,title,duration,active,sort_order,bytes,created_at)VALUES(?,?,?,?,?,1,?,?,?)',[$r['id'],$type,$path,$title,10,(int)one('SELECT COALESCE(MAX(sort_order),0)+1 n FROM signage_content WHERE restaurant_id=?',[$r['id']])['n'],$bytes,time()]);$cid=(int)db()->lastInsertId();q('INSERT INTO signage_targets(content_id,screen_id)VALUES(?,?)',[$cid,$screen?:null]);db()->commit();
  audit('signage_uploaded',$u,'signage',$cid);ok(['id'=>$cid,'path'=>$path,'kind'=>$type]);
 }
 fail(422,'validation');
}catch(Throwable$e){try{if(db()->inTransaction())db()->rollBack();}catch(Throwable$ignore){}log_error('upload',$e);fail(503,'unavailable');}
