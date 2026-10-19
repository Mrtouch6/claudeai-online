<?php
// Builds a database in the production v2 shape (old schema, user_version=2) with sample data, to test the v3 migration.
//   php test/seed-v2.php /tmp/aps-test
$dir=$argv[1]??'';if(!$dir)exit("dir?\n");@mkdir($dir,0700,true);@unlink("$dir/orders.sqlite");
$d=new PDO('sqlite:'.$dir.'/orders.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$d->exec(shell_exec('git -C '.escapeshellarg(dirname(__DIR__)).' show 5fe5f75:new/app/schema.sql'));$d->exec('PRAGMA user_version=2');
$now=time();$x=fn($s,$p=[])=>$d->prepare($s)->execute($p);
$x("INSERT INTO restaurants(name,slug,currency,tax_rate,subscription_plan,subscription_status,subscription_end,accepting_orders,created_at)VALUES('Dar Zellige','dar-zellige','MAD',1000,'Growth','active','2027-03-31',1,?)",[$now]);
$pw=password_hash('zellige-test-passphrase-2026',PASSWORD_BCRYPT);
$x("INSERT INTO users(email,name,role,restaurant_id,password_hash,created_at)VALUES('nadia@darzellige.ma','Nadia Bennani','restaurant_admin',1,?,?)",[$pw,$now]);
$x("INSERT INTO users(email,name,role,restaurant_id,password_hash,created_at)VALUES('omar@darzellige.ma','Omar','staff',1,?,?)",[$pw,$now]);
foreach([['Entrées','Starters','مقبلات'],['Tajines','Tagines','طواجن'],['Boissons','Drinks','مشروبات']] as$i=>$c)$x('INSERT INTO categories(restaurant_id,name_fr,name_en,name_ar,sort_order)VALUES(1,?,?,?,?)',[...$c,$i]);
foreach([[1,'Harira','Harira soup','حريرة',3500,'["gluten"]'],[1,'Zaalouk','Zaalouk','زعلوك',3000,'[]'],[2,'Tajine poulet citron','Chicken tagine','طاجين دجاج',9500,'[]'],[2,'Tajine agneau pruneaux','Lamb tagine','طاجين لحم',12000,'["nuts","sesame"]'],[3,'Thé à la menthe','Mint tea','أتاي',2500,'[]']] as$i=>$it)$x('INSERT INTO items(restaurant_id,category_id,name_fr,name_en,name_ar,price,allergens,sort_order,created_at)VALUES(1,?,?,?,?,?,?,?,?)',[...$it,$i,$now]);
foreach([['1','Salle',4],['2','Salle',2],['3','Terrasse',6]] as$t)$x('INSERT INTO dining_tables(restaurant_id,label,zone,seats,access_token)VALUES(1,?,?,?,?)',[$t[0],$t[1],$t[2],'tok'.$t[0].'a1b2c3d4e5f6a7b8c9d0e1f2']);
$x("INSERT INTO orders(public_id,status_token,restaurant_id,table_id,order_type,status,payment_method,subtotal,tax,service,total,created_at,updated_at)VALUES('OLD00001','oldtoken',1,1,'table','served','table',3500,350,0,3850,?,?)",[$now-7200,$now-7000]);
echo "seeded v2 at $dir\n";
