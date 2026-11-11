// "Videos on your iPhone through this PC": the video engine only listens on this PC
// (127.0.0.1:4567) and cannot run on an iPhone, so a small relay on the home network
// forwards the phone's requests to it:  http://<pc>:<port>/e/<code>/<path>
//   -> http://127.0.0.1:4567/<path>.
// Off until the person turns it on in Settings; every request needs the code shown
// there (kept between starts, so the phone stays linked). HLS playlists are
// rewritten so that the segments come back through the relay too.
const http=require('http')
const os=require('os')
const fs=require('fs')
const path=require('path')
const crypto=require('crypto')

const DEFAULT_PORT=4580
const MAX_SYNC=50*1024*1024
const ALPHABET='abcdefghjkmnpqrstuvwxyz23456789' // no look-alikes (0/o, 1/l/i)
const newCode=()=>Array.from(crypto.randomBytes(10),b=>ALPHABET[b%ALPHABET.length]).join('')
function lanAddresses(){const all=[];for(const list of Object.values(os.networkInterfaces()))for(const a of list||[])if(a.family==='IPv4'&&!a.internal)all.push(a.address)
 return all.sort((a,b)=>(/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(b)?1:0)-(/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a)?1:0))}

function createEngineShare({configFile,enginePort=4567,engineHost='127.0.0.1',port=DEFAULT_PORT,addresses=lanAddresses,log=()=>{},sync=null,name=os.hostname()}){
 const readCfg=()=>{try{return JSON.parse(fs.readFileSync(configFile,'utf8'))||{}}catch{return {}}}
 const writeCfg=c=>{fs.mkdirSync(path.dirname(configFile),{recursive:true});fs.writeFileSync(configFile,JSON.stringify(c))}
 let server=null,listening=0,lastSeen=0,lastFrom=''
 const code=()=>{const c=readCfg();if(!/^[a-z0-9]{10}$/.test(c.code||'')){c.code=newCode();writeCfg(c)}return c.code}

 function handle(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,HEAD,OPTIONS');res.setHeader('Access-Control-Expose-Headers','Content-Length,Content-Range')
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
  const m=/^\/e\/([a-z0-9]+)(\/.*)$/.exec(req.url||'')
  // Same answer for a wrong code and a wrong address: nothing to learn from outside.
  if(!m||m[1].length!==code().length||!crypto.timingSafeEqual(Buffer.from(m[1]),Buffer.from(code()))||!(m[2].startsWith('/api/v1/')||m[2].startsWith('/nr/'))){res.writeHead(404);res.end();return}
  lastSeen=Date.now();lastFrom=String(req.socket.remoteAddress||'').replace(/^::ffff:/,'')
  // The app's own answers: who this is, and the library sync file (direct sync with a phone).
  if(m[2].startsWith('/nr/')){
   const json=(status,body)=>{const out=JSON.stringify(body);res.writeHead(status,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(out)});res.end(out)}
   if(m[2]==='/nr/hello'&&req.method==='GET')return json(200,{app:'NovelReader',device:name,sync:!!sync})
   if(m[2]==='/nr/sync'&&sync&&req.method==='GET'){sync.read().then(x=>json(200,x||null),e=>json(500,{error:String(e&&e.message||e)}));return}
   if(m[2]==='/nr/sync'&&sync&&req.method==='POST'){const chunks=[];let size=0
    req.on('data',d=>{size+=d.length;if(size>MAX_SYNC){req.destroy();return}chunks.push(d)})
    req.on('end',()=>{let x;try{x=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return json(400,{error:'Invalid sync data.'})}sync.write(x).then(r=>json(200,r),e=>json(400,{error:String(e&&e.message||e)}))});return}
   res.writeHead(404);res.end();return}
  const headers={};for(const k of['range','content-type','content-length','accept'])if(req.headers[k])headers[k]=req.headers[k]
  const up=http.request({host:engineHost,port:enginePort,path:m[2],method:req.method,headers},r=>{
   const type=String(r.headers['content-type']||'')
   const self='http://'+(req.headers.host||addresses()[0]+':'+listening)+'/e/'+m[1]+'/'
   if(/mpegurl/i.test(type)||/\/api\/v1\/hls\?/.test(m[2])&&!/video|octet/i.test(type)){
    let body='';r.setEncoding('utf8');r.on('data',d=>{body+=d});r.on('end',()=>{const out=body.replace(new RegExp('http://(?:127\\.0\\.0\\.1|localhost):'+enginePort+'/','g'),self);res.writeHead(r.statusCode||200,{'Content-Type':type||'application/vnd.apple.mpegurl','Content-Length':Buffer.byteLength(out)});res.end(out)});return}
   const h={};for(const k of['content-type','content-length','content-range','accept-ranges'])if(r.headers[k])h[k]=r.headers[k]
   res.writeHead(r.statusCode||200,h);r.pipe(res)
  })
  up.on('error',e=>{log('engine not reachable',e.message);try{res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The video engine of the PC is not running.'}))}catch{}})
  res.on('close',()=>{if(!res.writableEnded)up.destroy()})
  req.pipe(up)
 }
 function listen(p){return new Promise((resolve,reject)=>{const s=http.createServer(handle);s.once('error',reject);s.listen(p,'0.0.0.0',()=>{server=s;listening=s.address().port;resolve(listening)})})}
 async function start(){
  if(server)return listening
  // The usual port, so the address typed on the phone stays the same; another one if it is taken.
  try{return await listen(port)}catch(e){if(e.code!=='EADDRINUSE')throw e;return listen(0)}
 }
 function stop(){try{server&&server.close()}catch{}server=null;listening=0}
 function status(){
  const on=!!server,c=code(),ips=addresses()
  return{enabled:on,port:listening,code:c,addresses:on?ips.map(ip=>ip+':'+listening):[],link:on&&ips[0]?ips[0]+':'+listening+'/'+c:'',lastSeen,lastFrom}
 }
 async function enable(){const c=readCfg();c.enabled=true;writeCfg(c);await start();return status()}
 function disable(){const c=readCfg();c.enabled=false;writeCfg(c);stop();return status()}
 // A new code: phones linked before must be linked again.
 function renew(){const c=readCfg();c.code=newCode();writeCfg(c);return status()}
 // At app start: back on if it was on.
 async function restore(){if(readCfg().enabled){try{await start()}catch(e){log('share not started',e.message)}}return status()}
 return{status,enable,disable,renew,restore,stop}
}
// "192.168.1.5:4580/abcdefghjk" (as shown on the PC; spaces, http:// and capitals forgiven) -> base address.
function parseLink(text){
 const m=/^(?:https?:\/\/)?((?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+):(\d{2,5})\/(?:e\/)?([a-z0-9]{10})\/?$/i.exec(String(text||'').trim().replace(/\s+/g,''))
 return m?'http://'+m[1].toLowerCase()+':'+m[2]+'/e/'+m[3].toLowerCase():''
}
module.exports={createEngineShare,parseLink,DEFAULT_PORT}
