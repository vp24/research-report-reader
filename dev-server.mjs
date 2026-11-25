// Local preview/test server only. Deploy public/ directly; no server is needed.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const headers=Object.fromEntries((await readFile(path.join(root,'_headers'),'utf8')).split('\n').filter(s=>s.startsWith('  ')).map(s=>{const i=s.indexOf(':');return[s.slice(0,i).trim(),s.slice(i+1).trim()];}));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
 for(const[k,v]of Object.entries(headers))res.setHeader(k,v);
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 try{
  let url=new URL(req.url,'http://localhost').pathname;
  if(['/login','/register','/setup'].includes(url)){res.writeHead(302,{Location:'/'});res.end();return;}
  url=decodeURIComponent(url);if(url==='/')url='/index.html';
  const filename=path.resolve(root,'.'+url);
  if(!filename.startsWith(root)||url.startsWith('/_')||url.split('/').some(s=>s.startsWith('.')))throw Error('Invalid path');
  const body=await readFile(filename);res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');res.writeHead(200);res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}
});
server.listen(Number(process.env.PORT||8080),'127.0.0.1',()=>console.log(`Preview at http://127.0.0.1:${server.address().port}`));
