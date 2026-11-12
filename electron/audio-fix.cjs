// Sound for videos whose audio the built-in player cannot decode (AC3 / E-AC3 /
// DTS / TrueHD, common in big "remux" files): ffmpeg reads the same stream and
// sends only the sound, converted to AAC, to a small local server. The page plays
// it next to the (silent) video and keeps both in step.
// ffmpeg is downloaded once, the first time it is needed (about 30 MB).
const fs=require('fs')
const path=require('path')
const http=require('http')
const zlib=require('zlib')
const {spawn}=require('child_process')

const FFMPEG_TAG='b6.1.1'
// The downloaded program is checked against the known fingerprint (SHA-256) of that
// exact release before it is ever run: nothing unexpected gets executed.
const FFMPEG_SHA256={'win32-x64':'8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77','linux-x64':'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa','darwin-x64':'929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106','darwin-arm64':'8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa'}
const FFMPEG_URL=(platform,arch)=>`https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_TAG}/ffmpeg-${platform}-${arch}.gz`
// Only local streams (the video engine, the torrent server) can be converted.
const LOCAL_SRC=/^http:\/\/(127\.0\.0\.1|localhost):\d+\//i

function createAudioFix({app,log=console,fetchImpl=globalThis.fetch,spawnImpl=spawn,platform=process.platform,arch=process.arch}){
 const dir=()=>path.join(app.getPath('userData'),'tools')
 const exe=()=>path.join(dir(),platform==='win32'?'ffmpeg.exe':'ffmpeg')
 let bin=null,installing=null,server=null,port=0
 const procs=new Set()
 async function works(p){return new Promise(res=>{try{const c=spawnImpl(p,['-hide_banner','-version'],{windowsHide:true});let ok=false;c.stdout&&c.stdout.on('data',d=>{if(/ffmpeg version/i.test(String(d)))ok=true});c.on('error',()=>res(false));c.on('close',code=>res(ok||code===0))}catch{res(false)}})}
 // A system ffmpeg is used when there is one (Linux, developers); otherwise the
 // static build is downloaded next to the app data.
 async function ensure(onProgress){
  if(bin)return bin
  if(installing)return installing
  installing=(async()=>{
   if(fs.existsSync(exe())&&await works(exe()))return bin=exe()
   if(platform!=='win32'&&await works('ffmpeg'))return bin='ffmpeg'
   fs.mkdirSync(dir(),{recursive:true})
   const r=await fetchImpl(FFMPEG_URL(platform,arch))
   if(!r.ok||!r.body)throw new Error('ffmpeg download failed (HTTP '+r.status+')')
   const total=Number(r.headers.get('content-length'))||0,part=exe()+'.part'
   let got=0
   const hash=require('crypto').createHash('sha256')
   await new Promise((resolve,reject)=>{
    const out=fs.createWriteStream(part,{mode:0o755}),gunzip=zlib.createGunzip()
    gunzip.on('error',reject);out.on('error',reject);out.on('finish',resolve)
    gunzip.pipe(out)
    ;(async()=>{try{const reader=r.body.getReader();for(;;){const{done,value}=await reader.read();if(done)break;got+=value.length;hash.update(value);onProgress&&onProgress(total?got/total:0);if(!gunzip.write(Buffer.from(value)))await new Promise(x=>gunzip.once('drain',x))}gunzip.end()}catch(e){reject(e)}})()
   })
   if(fs.statSync(part).size<5e6)throw new Error('ffmpeg download incomplete')
   const want=FFMPEG_SHA256[platform+'-'+arch],got256=hash.digest('hex')
   if(!want||got256!==want){try{fs.unlinkSync(part)}catch{}throw new Error('ffmpeg download does not match the expected file; it was not installed')}
   fs.renameSync(part,exe())
   if(!await works(exe())){try{fs.unlinkSync(exe())}catch{}throw new Error('ffmpeg does not start on this PC')}
   return bin=exe()
  })().finally(()=>{installing=null})
  return installing
 }
 // Audio streams of a video: [{index, codec, lang, title, channels}]
 async function probe(src){
  if(!LOCAL_SRC.test(String(src)))throw new Error('Only local streams can be converted')
  const b=await ensure()
  const text=await new Promise(res=>{let err='';const c=spawnImpl(b,['-hide_banner','-i',src],{windowsHide:true});procs.add(c);c.stderr.on('data',d=>{err+=String(d)});const tm=setTimeout(()=>{try{c.kill()}catch{}},45000);c.on('error',()=>res(err));c.on('close',()=>{clearTimeout(tm);procs.delete(c);res(err)})})
  return parseStreams(text)
 }
 function startServer(){
  if(server)return Promise.resolve(port)
  server=http.createServer((req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1')
   const src=u.searchParams.get('src')||'',t=Math.max(0,Number(u.searchParams.get('t'))||0),track=Math.max(0,parseInt(u.searchParams.get('track')||'0',10)||0)
   if(u.pathname!=='/audio'||!LOCAL_SRC.test(src)||!bin){res.writeHead(404);res.end();return}
   const args=['-hide_banner','-loglevel','error','-ss',String(t),'-i',src,'-map','0:a:'+track,'-vn','-sn','-dn','-c:a','aac','-b:a','192k','-ac','2','-f','adts','pipe:1']
   const c=spawnImpl(bin,args,{windowsHide:true});procs.add(c)
   res.writeHead(200,{'Content-Type':'audio/aac','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'})
   c.stdout.pipe(res)
   c.stderr.on('data',d=>log.warn&&log.warn('[audio-fix]',String(d).trim().slice(0,300)))
   const stop=()=>{try{c.kill('SIGKILL')}catch{}procs.delete(c)}
   req.on('close',stop);c.on('close',()=>{procs.delete(c);try{res.end()}catch{}});c.on('error',()=>{try{res.end()}catch{}})
  })
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{port=server.address().port;resolve(port)})})
 }
 async function start(src,onProgress){const streams=await (async()=>{await ensure(onProgress);return probe(src)})();const p=await startServer();return{base:'http://127.0.0.1:'+p+'/audio',streams}}
 function stopAll(){for(const c of procs){try{c.kill('SIGKILL')}catch{}}procs.clear()}
 return{ensure,probe,start,stopAll,close:()=>{stopAll();try{server&&server.close()}catch{}server=null}}
}

// "Stream #0:1(fre): Audio: eac3, 48000 Hz, 5.1(side), fltp (default)" + "title : VFF"
function parseStreams(text){
 const lines=String(text).split(/\r?\n/),out=[]
 for(let i=0;i<lines.length;i++){
  const m=/Stream #\d+:\d+(?:\[[^\]]*\])?(?:\(([a-z]{2,3})\))?: Audio: ([a-z0-9_-]+)[^,]*(?:, (\d+) Hz)?(?:, ([^,]+))?/i.exec(lines[i])
  if(!m)continue
  let title=''
  for(let j=i+1;j<Math.min(lines.length,i+6);j++){if(/Stream #/.test(lines[j]))break;const tm=/^\s*title\s*:\s*(.+)$/i.exec(lines[j]);if(tm){title=tm[1].trim();break}}
  out.push({index:out.length,lang:(m[1]||'').toLowerCase(),codec:m[2].toLowerCase(),channels:(m[4]||'').trim(),title,default:/\(default\)/.test(lines[i])})
 }
 return out
}
module.exports={createAudioFix,parseStreams,FFMPEG_URL}
