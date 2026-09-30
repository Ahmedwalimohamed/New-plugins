import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname=dirname(fileURLToPath(import.meta.url));
const html=await readFile(join(__dirname,'index.html'));
const port=Number(process.env.PORT||3000);
http.createServer((req,res)=>{
  if(req.url==='/health'){
    res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    return res.end(JSON.stringify({ok:true,service:'fsl-concierge-ui',version:'0.3.1'}));
  }
  res.writeHead(200,{
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  });
  res.end(html);
}).listen(port,'0.0.0.0',()=>console.log(`FSL Concierge UI listening on ${port}`));