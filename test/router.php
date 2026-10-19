<?php
// php -S router that mimics public/.htaccess (rewrites + security headers) for local runs of the real api.php:
//   APS_ORDER_ENV=test APS_ORDER_TEST_DIR=/tmp/aps php -S 127.0.0.1:4190 -t new/public test/router.php
$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);$root=$_SERVER['DOCUMENT_ROOT'];
if(preg_match('/^\s*Header always set Content-Security-Policy "([^"]+)"/m',(string)file_get_contents($root.'/.htaccess'),$m))header('Content-Security-Policy: '.$m[1]);
if($p!=='/'&&is_file($root.$p)&&!str_ends_with($p,'.php'))return false;
$page=match(true){$p==='/'||(bool)preg_match('#^/r/#',$p)=>'index.html',(bool)preg_match('#^/staff/?$#',$p)=>'staff.html',(bool)preg_match('#^/screen/?$#',$p)=>'screen.html',default=>null};
if($page){header('Content-Type: text/html; charset=utf-8');readfile($root.'/'.$page);return true;}
if(str_ends_with($p,'.php')&&is_file($root.$p)){header_remove('Content-Security-Policy');return false;}
http_response_code(404);echo 'not found';
