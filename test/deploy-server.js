// Serves the new build to the cPanel tab (CORS-enabled, read-only, localhost only).
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../new');
http.createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Private-Network','true');
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET','Access-Control-Allow-Headers':'*'});return res.end()}
 const f=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));
 if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end()}
 res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});fs.createReadStream(f).pipe(res);
}).listen(4191,'127.0.0.1',()=>console.log('deploy server on 4191'));
