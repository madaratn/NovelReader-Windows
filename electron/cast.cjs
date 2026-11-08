// Cast to a TV on the same Wi-Fi: Chromecast / Google TV (Cast protocol) and smart
// TVs that are DLNA "media renderers" (most Samsung, LG, Sony, Philips, Android TV…).
// The TV cannot reach the video engine (it only listens on this PC), so a small
// relay listens on the local network and forwards to it: /t/<token>/<port>/<path>
// -> http://127.0.0.1:<port>/<path>. Only the ports of the videos being cast are
// allowed, behind a random token. HLS playlists are rewritten to go through it too.
const http=require('http')
const os=require('os')
const dgram=require('dgram')
const crypto=require('crypto')

// ---- Relay -------------------------------------------------------------------------
function lanAddress(near=''){
 const all=[];for(const list of Object.values(os.networkInterfaces()))for(const a of list||[])if(a.family==='IPv4'&&!a.internal)all.push(a.address)
 const prefix=String(near).split('.').slice(0,3).join('.')+'.'
 return all.find(a=>near&&a.startsWith(prefix))||all.find(a=>/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a))||all[0]||'127.0.0.1'
}
function createRelay({fetchHost='127.0.0.1'}={}){
 const token=crypto.randomBytes(12).toString('hex'),ports=new Set()
 let server=null,port=0
 const base=host=>`http://${host}:${port}/t/${token}/`
 // http://127.0.0.1:4567/api/... -> http://<lan>:<relay>/t/<token>/4567/api/...
 function toLan(url,host){const u=new URL(url);if(!/^(127\.0\.0\.1|localhost)$/.test(u.hostname))return url;ports.add(Number(u.port||80));return base(host)+(u.port||80)+u.pathname+u.search}
 function start(){
  if(server)return Promise.resolve(port)
  server=http.createServer((req,res)=>{
   const m=/^\/t\/([0-9a-f]+)\/(\d+)(\/.*)$/.exec(req.url||'')
   res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*')
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
   if(!m||m[1]!==token||!ports.has(Number(m[2]))){res.writeHead(404);res.end();return}
   const headers={};if(req.headers.range)headers.range=req.headers.range
   const up=http.request({host:fetchHost,port:Number(m[2]),path:m[3],method:req.method==='HEAD'?'HEAD':'GET',headers},r=>{
    const type=String(r.headers['content-type']||'')
    const isList=/mpegurl/i.test(type)||/\.m3u8(\?|$)/i.test(m[3])
    if(isList){let body='';r.setEncoding('utf8');r.on('data',d=>{body+=d});r.on('end',()=>{const host=req.headers.host?String(req.headers.host).split(':')[0]:lanAddress();const out=body.replace(/http:\/\/(?:127\.0\.0\.1|localhost):(\d+)\//g,(_x,p)=>{ports.add(Number(p));return base(host)+p+'/'});res.writeHead(r.statusCode||200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});res.end(out)});return}
    const h={};for(const k of['content-type','content-length','content-range','accept-ranges'])if(r.headers[k])h[k]=r.headers[k]
    if(!h['accept-ranges']&&(h['content-length']||h['content-range']))h['accept-ranges']='bytes'
    // DLNA TVs like these headers.
    h['transferMode.dlna.org']='Streaming';h['contentFeatures.dlna.org']='DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'
    res.writeHead(r.statusCode||200,h);r.pipe(res)
   })
   up.on('error',()=>{try{res.writeHead(502);res.end()}catch{}});req.on('close',()=>up.destroy());up.end()
  })
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'0.0.0.0',()=>{port=server.address().port;resolve(port)})})
 }
 return{start,toLan,token,close:()=>{try{server&&server.close()}catch{}server=null},port:()=>port}
}

// ---- DLNA (UPnP AV) ------------------------------------------------------------------
const xmlText=(xml,tag)=>{const m=new RegExp('<(?:\\w+:)?'+tag+'[^>]*>([\\s\\S]*?)</(?:\\w+:)?'+tag+'>','i').exec(xml);return m?m[1].trim():''}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
function parseDescription(xml,location){
 const name=xmlText(xml,'friendlyName')||'TV'
 const services=[...String(xml).matchAll(/<(?:\w+:)?service>([\s\S]*?)<\/(?:\w+:)?service>/gi)].map(m=>({type:xmlText(m[1],'serviceType'),control:xmlText(m[1],'controlURL')}))
 const av=services.find(s=>/AVTransport/i.test(s.type)),rc=services.find(s=>/RenderingControl/i.test(s.type))
 if(!av)return null
 const abs=u=>new URL(u,xmlText(xml,'URLBase')||location).toString()
 return{kind:'dlna',id:'dlna:'+(xmlText(xml,'UDN')||location),name:name.replace(/&amp;/g,'&'),host:new URL(location).hostname,avType:av.type,avControl:abs(av.control),rcType:rc?.type||'',rcControl:rc?abs(rc.control):''}
}
function soapBody(type,action,args){return `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${type}">${Object.entries(args).map(([k,v])=>`<${k}>${esc(v)}</${k}>`).join('')}</u:${action}></s:Body></s:Envelope>`}
function didl(url,title,mime){return `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>${esc(title)}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:${mime}:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000">${esc(url)}</res></item></DIDL-Lite>`}
const hms=s=>{s=Math.max(0,Math.floor(s));return[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':')}
const secs=t=>{const p=String(t||'').split(':').map(Number);return p.length===3&&p.every(Number.isFinite)?p[0]*3600+p[1]*60+p[2]:0}
function dlnaDevice(d,fetchImpl){
 const soap=async(control,type,action,args)=>{const r=await fetchImpl(control,{method:'POST',headers:{'Content-Type':'text/xml; charset="utf-8"',SOAPAction:`"${type}#${action}"`},body:soapBody(type,action,args)});const text=await r.text();if(!r.ok)throw new Error(d.name+': '+(xmlText(text,'errorDescription')||'HTTP '+r.status));return text}
 const av=(a,args={})=>soap(d.avControl,d.avType,a,{InstanceID:0,...args})
 return{
  async load({url,title,mime,startAt}){try{await av('Stop')}catch{}await av('SetAVTransportURI',{CurrentURI:url,CurrentURIMetaData:didl(url,title,mime)});await av('Play',{Speed:1});if(startAt>5){await new Promise(r=>setTimeout(r,2500));try{await av('Seek',{Unit:'REL_TIME',Target:hms(startAt)})}catch{}}},
  play:()=>av('Play',{Speed:1}),pause:()=>av('Pause'),stop:()=>av('Stop'),
  seek:t=>av('Seek',{Unit:'REL_TIME',Target:hms(t)}),
  volume:v=>d.rcControl?soap(d.rcControl,d.rcType,'SetVolume',{InstanceID:0,Channel:'Master',DesiredVolume:Math.round(v*100)}):Promise.resolve(),
  async status(){const p=await av('GetPositionInfo');let state='';try{state=xmlText(await av('GetTransportInfo'),'CurrentTransportState')}catch{}return{time:secs(xmlText(p,'RelTime')),duration:secs(xmlText(p,'TrackDuration')),playing:state==='PLAYING',state:state.toLowerCase()}},
  close(){}
 }
}
function ssdpSearch(timeout,onLocation){
 return new Promise(resolve=>{
  let sock;try{sock=dgram.createSocket({type:'udp4',reuseAddr:true})}catch{resolve();return}
  const msg=t=>Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${t}\r\n\r\n`)
  sock.on('message',b=>{const loc=/^location:\s*(.+)$/im.exec(String(b));if(loc)onLocation(loc[1].trim())})
  sock.on('error',()=>{})
  sock.bind(0,()=>{for(const t of['urn:schemas-upnp-org:device:MediaRenderer:1','urn:schemas-upnp-org:service:AVTransport:1'])for(let i=0;i<2;i++)setTimeout(()=>{try{sock.send(msg(t),1900,'239.255.255.250')}catch{}},i*400)})
  setTimeout(()=>{try{sock.close()}catch{}resolve()},timeout)
 })
}

// ---- Chromecast ----------------------------------------------------------------------
function mdnsSearch(timeout,onDevice){
 return new Promise(resolve=>{
  let m;try{m=require('multicast-dns')()}catch{resolve();return}
  const seen=new Set()
  m.on('response',r=>{const all=[...(r.answers||[]),...(r.additionals||[])]
   const srv=all.find(a=>a.type==='SRV'&&/_googlecast/.test(a.name));if(!srv)return
   const txt=all.find(a=>a.type==='TXT'&&a.name===srv.name);const fields={};for(const b of(txt&&txt.data)||[]){const[k,...v]=String(b).split('=');fields[k]=v.join('=')}
   const ip=(all.find(a=>a.type==='A'&&a.name===srv.data.target)||all.find(a=>a.type==='A'))?.data
   if(!ip||seen.has(ip))return;seen.add(ip)
   onDevice({kind:'cast',id:'cast:'+(fields.id||ip),name:fields.fn||srv.name.split('.')[0],host:ip,port:srv.data.port||8009})})
  m.on('error',()=>{})
  const ask=()=>{try{m.query({questions:[{name:'_googlecast._tcp.local',type:'PTR'}]})}catch{}};ask();setTimeout(ask,700)
  setTimeout(()=>{try{m.destroy()}catch{}resolve()},timeout)
 })
}
function castDevice(d,clientFactory){
 let client=null,player=null
 const call=(fn,...a)=>new Promise((res,rej)=>{if(!player)return rej(new Error('Not connected'));player[fn](...a,(e,s)=>e?rej(e):res(s))})
 return{
  async load({url,title,mime,startAt,subtitles=[]}){
   const{Client,DefaultMediaReceiver}=clientFactory()
   client=new Client()
   await new Promise((res,rej)=>{client.on('error',rej);client.connect({host:d.host,port:d.port||8009},res)})
   player=await new Promise((res,rej)=>client.launch(DefaultMediaReceiver,(e,p)=>e?rej(e):res(p)))
   const tracks=subtitles.map((s,i)=>({trackId:i+1,type:'TEXT',trackContentId:s.url,trackContentType:'text/vtt',name:s.label||'Subtitles',language:s.lang||'',subtype:'SUBTITLES'}))
   await new Promise((res,rej)=>player.load({contentId:url,contentType:mime,streamType:'BUFFERED',metadata:{type:0,metadataType:0,title},tracks:tracks.length?tracks:undefined,textTrackStyle:tracks.length?{backgroundColor:'#00000000',edgeType:'OUTLINE',edgeColor:'#000000FF'}:undefined},{autoplay:true,currentTime:startAt||0,activeTrackIds:tracks.length?[1]:[]},(e,s)=>e?rej(e):res(s)))
  },
  play:()=>call('play'),pause:()=>call('pause'),stop:async()=>{try{await call('stop')}catch{}},
  seek:t=>call('seek',t),
  volume:v=>new Promise(res=>{try{client.setVolume({level:v},()=>res())}catch{res()}}),
  async status(){const s=await call('getStatus');return{time:Number(s?.currentTime)||0,duration:Number(s?.media?.duration)||0,playing:s?.playerState==='PLAYING'||s?.playerState==='BUFFERING',state:String(s?.playerState||'').toLowerCase()}},
  close(){try{client&&client.close()}catch{}client=null;player=null}
 }
}

// ---- Manager -----------------------------------------------------------------------
const mimeOf=url=>/\/api\/v1\/hls\?|\.m3u8/i.test(url)?'application/x-mpegURL':/\.mkv(\?|$|&)/i.test(decodeURIComponent(url))?'video/x-matroska':/\.webm(\?|$|&)/i.test(decodeURIComponent(url))?'video/webm':'video/mp4'
function createCast({fetchImpl=globalThis.fetch,clientFactory=()=>require('castv2-client'),discover=null,log=console}={}){
 const relay=createRelay()
 let devices=new Map(),current=null,currentDevice=null
 async function scan(timeout=4000){
  if(discover){const list=await discover();devices=new Map(list.map(d=>[d.id,d]));return list.map(({id,name,kind,host})=>({id,name,kind,host}))}
  const found=new Map(),jobs=[]
  await Promise.all([
   ssdpSearch(timeout,loc=>{if(found.has(loc))return;found.set(loc,null);jobs.push(fetchImpl(loc).then(r=>r.text()).then(x=>{const d=parseDescription(x,loc);if(d)found.set(loc,d)}).catch(()=>{}))}),
   mdnsSearch(timeout,d=>found.set(d.id,d))])
  await Promise.all(jobs)
  devices=new Map([...found.values()].filter(Boolean).map(d=>[d.id,d]))
  return[...devices.values()].map(({id,name,kind,host})=>({id,name,kind,host}))
 }
 async function start({deviceId,url,title,startAt=0,subtitles=[]}){
  const d=devices.get(deviceId);if(!d)throw new Error('This TV is no longer found. Search again.')
  await relay.start()
  const host=lanAddress(d.host)
  const lanUrl=relay.toLan(url,host),subs=subtitles.filter(s=>s&&s.url).map(s=>({...s,url:relay.toLan(s.url,host)}))
  if(current&&currentDevice!==deviceId){try{await current.stop()}catch{}current.close()}
  if(!current||currentDevice!==deviceId){current=d.kind==='cast'?castDevice(d,clientFactory):dlnaDevice(d,fetchImpl);currentDevice=deviceId}
  await current.load({url:lanUrl,title:String(title||'NovelReader'),mime:mimeOf(url),startAt,subtitles:subs})
  return{device:{id:d.id,name:d.name,kind:d.kind},url:lanUrl}
 }
 const need=()=>{if(!current)throw new Error('Nothing is being cast');return current}
 return{scan,start,
  control:async(action,value)=>{const c=need();if(action==='play')return c.play();if(action==='pause')return c.pause();if(action==='seek')return c.seek(Number(value)||0);if(action==='volume')return c.volume(Math.max(0,Math.min(1,Number(value))));throw new Error('Unknown action')},
  status:async()=>current?need().status():null,
  stop:async()=>{if(!current)return;try{await current.stop()}catch{}current.close();current=null;currentDevice=null},
  close:()=>{try{current&&current.close()}catch{}relay.close()},
  _relay:relay}
}
module.exports={createCast,createRelay,parseDescription,soapBody,didl,mimeOf,lanAddress}
