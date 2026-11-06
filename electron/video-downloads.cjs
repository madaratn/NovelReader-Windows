// Offline video downloads (anime / series / movies).
//
// The renderer resolves an episode to one or more candidate streams (engine proxy
// URLs: /api/v1/hls?… for HLS, /api/v1/proxy?… for direct files) and queues it.
// Downloads run one at a time in the main process:
//   - direct file  -> <dir>/video.<ext>
//   - HLS          -> every segment / key / init section of the best variant (and
//                     its audio renditions) saved next to a rewritten local playlist.
// External subtitles are saved too. Finished downloads are served by a small HTTP
// server bound to 127.0.0.1 so hls.js and <video> play them like any stream.
const fs=require('fs')
const path=require('path')
const http=require('http')

const SAFE=s=>String(s||'').replace(/[^a-z0-9._-]+/gi,'_').slice(0,80)
const TYPES={'.m3u8':'application/vnd.apple.mpegurl','.ts':'video/mp2t','.m4s':'video/iso.segment','.mp4':'video/mp4','.m4a':'audio/mp4','.aac':'audio/aac','.vtt':'text/vtt','.srt':'text/plain','.ass':'text/plain','.key':'application/octet-stream','.mkv':'video/x-matroska','.webm':'video/webm'}

function createVideoDownloads({root,log=()=>{},notify=()=>{},fetchImpl=globalThis.fetch}){
 fs.mkdirSync(root,{recursive:true})
 const jobs=new Map() // id -> {meta, state, progress, error, abort}
 const queue=[]
 let running=null,server=null,port=0
 // Settings: max height of the HLS variant kept (0 = best up to 1080p) and a
 // bandwidth cap in bytes per second shared by all downloads (0 = no limit).
 const settings={maxHeight:0,limit:0}
 let budgetAt=Date.now(),budget=0
 async function throttle(bytes,signal){
  if(!settings.limit)return
  const now=Date.now();budget=Math.max(0,budget-(now-budgetAt)*settings.limit/1000);budgetAt=now;budget+=bytes
  const wait=budget/settings.limit*1000-200
  if(wait>0)await new Promise((res,rej)=>{const tm=setTimeout(res,Math.min(wait,30000));signal&&signal.addEventListener('abort',()=>{clearTimeout(tm);rej(new Error('aborted'))},{once:true})})
 }
 function configure(o){const p=o||{};if(p.maxHeight!=null)settings.maxHeight=Math.max(0,Number(p.maxHeight)||0);if(p.limit!=null)settings.limit=Math.max(0,Number(p.limit)||0);return{...settings}}

 const metaFile=id=>path.join(root,id,'meta.json')
 const readMeta=id=>{try{return JSON.parse(fs.readFileSync(metaFile(id),'utf8'))}catch{return null}}
 const writeMeta=(id,meta)=>fs.writeFileSync(metaFile(id),JSON.stringify(meta,null,1))
 const dirSize=dir=>{let n=0;try{for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);n+=f.isDirectory()?dirSize(p):fs.statSync(p).size}}catch{}return n}
 const changed=()=>notify()

 async function get(url,signal,asText){
  let last
  for(let attempt=0;attempt<4;attempt++){
   try{const r=await fetchImpl(url,{signal});if(!r.ok){const e=new Error('HTTP '+r.status);e.status=r.status;throw e}return asText?await r.text():Buffer.from(await r.arrayBuffer())}
   catch(e){last=e;if((signal&&signal.aborted)||(e.status>=400&&e.status<500&&e.status!==429)||(asText&&attempt>=1))throw e;await new Promise(res=>setTimeout(res,600*(attempt+1)))}
  }
  throw last
 }
 async function saveStream(url,file,signal,onBytes){
  const r=await fetchImpl(url,{signal});if(!r.ok)throw new Error('HTTP '+r.status)
  const total=Number(r.headers.get('content-length'))||0,out=fs.createWriteStream(file);let got=0
  try{for await(const chunk of r.body){got+=chunk.length;if(!out.write(chunk))await new Promise(res=>out.once('drain',res));onBytes(got,total);await throttle(chunk.length,signal)}}
  finally{await new Promise(res=>out.end(res))}
  if(!got)throw new Error('Empty file')
  return got
 }
 const attr=(line,name)=>{const m=new RegExp(name+'=("([^"]*)"|[^,]*)').exec(line);return m?(m[2]!=null?m[2]:m[1]):''}

 // Download one media playlist into dir/<prefix>…; returns the local playlist file name.
 async function mediaPlaylist(url,dir,prefix,job,weight){
  const text=await get(url,job.abort.signal,true)
  const lines=text.split(/\r?\n/),out=[],files=new Map(),tasks=[]
  const local=(uri,ext)=>{const abs=new URL(uri,url).toString();if(!files.has(abs)){const name=prefix+files.size+ext;files.set(abs,name);tasks.push({abs,name})}return files.get(abs)}
  const extOf=(uri,def)=>{try{const e=path.extname(new URL(uri,url).pathname).toLowerCase();return TYPES[e]&&e!=='.m3u8'?e:def}catch{return def}}
  for(const line of lines){
   if(/^#EXT-X-(KEY|MAP|SESSION-KEY):/.test(line)&&/URI="/.test(line)){const uri=attr(line,'URI');out.push(line.replace(/URI="[^"]*"/,'URI="'+local(uri,/^#EXT-X-MAP/.test(line)?'.mp4':'.key')+'"'));continue}
   if(line&&!line.startsWith('#')){out.push(local(line.trim(),extOf(line.trim(),'.ts')));continue}
   out.push(line)
  }
  if(!tasks.length)throw new Error('Empty playlist')
  let done=0;const q=[...tasks]
  await Promise.all(Array.from({length:4},async()=>{while(q.length){const t=q.shift();const buf=await get(t.abs,job.abort.signal,false);fs.writeFileSync(path.join(dir,t.name),buf);job.bytes+=buf.length;await throttle(buf.length,job.abort.signal);done++;job.progress=Math.min(0.99,job.base+weight*done/tasks.length);job.tick()}}))
  job.base+=weight
  const name=prefix+'index.m3u8';fs.writeFileSync(path.join(dir,name),out.join('\n'));return name
 }

 async function downloadHls(url,dir,job){
  const text=await get(url,job.abort.signal,true)
  if(!/#EXT-X-STREAM-INF/.test(text)){job.base=0;return mediaPlaylist(url,dir,'v',job,1)}
  // Master playlist: keep the best variant (or the one under ~1080p) and its audio group.
  const lines=text.split(/\r?\n/),variants=[]
  for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF')){const uri=(lines.slice(i+1).find(l=>l&&!l.startsWith('#'))||'').trim();if(uri)variants.push({inf:lines[i],uri,bw:Number(attr(lines[i],'BANDWIDTH'))||0,h:Number((attr(lines[i],'RESOLUTION').split('x')[1]))||0,audio:attr(lines[i],'AUDIO')})}
  const cap=settings.maxHeight||1080
  // Best variant within the cap; if none fits, the smallest one above it.
  const fits=v=>!v.h||v.h<=cap
  variants.sort((a,b)=>(fits(b)?1:0)-(fits(a)?1:0)||(fits(a)?b.bw-a.bw:a.bw-b.bw))
  const v=variants[0];if(!v)throw new Error('No variant in playlist')
  const audios=v.audio?lines.filter(l=>l.startsWith('#EXT-X-MEDIA')&&/TYPE=AUDIO/.test(l)&&attr(l,'GROUP-ID')===v.audio&&/URI="/.test(l)).slice(0,4):[]
  const weight=1/(1+audios.length*0.25),out=['#EXTM3U','#EXT-X-VERSION:6'];job.base=0
  const vname=await mediaPlaylist(new URL(v.uri,url).toString(),dir,'v',job,weight)
  let i=0;for(const a of audios){const name=await mediaPlaylist(new URL(attr(a,'URI'),url).toString(),dir,'a'+i+'_',job,(1-weight)/audios.length);out.push(a.replace(/URI="[^"]*"/,'URI="'+name+'"'));i++}
  out.push(v.inf.replace(/,?(SUBTITLES|CLOSED-CAPTIONS)=("[^"]*"|[^,]*)/g,''),vname)
  fs.writeFileSync(path.join(dir,'index.m3u8'),out.join('\n'));return 'index.m3u8'
 }

 async function runJob(job){
  const {meta}=job,dir=path.join(root,meta.id)
  fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true})
  let lastTick=0;job.tick=()=>{const now=Date.now();if(now-lastTick>500){lastTick=now;changed()}}
  const errors=[]
  for(const c of meta.candidates||[]){
   if(job.abort.signal.aborted)break
   try{
    job.base=0;job.bytes=0;job.progress=0;let file
    if(c.type==='hls')file=await downloadHls(c.url,dir,job)
    else{const em=/\.(mkv|webm)(\?|&|$)/i.exec(decodeURIComponent(c.url)),ext=em?'.'+em[1].toLowerCase():'.mp4';file='video'+ext;await saveStream(c.url,path.join(dir,file),job.abort.signal,(got,total)=>{job.bytes=got;job.progress=total?Math.min(0.99,got/total):0;job.tick()})}
    const subtitles=[];let n=0
    for(const s of (c.subtitles||[]).slice(0,8)){try{const buf=await get(s.url,job.abort.signal,false);const ext=/^\s*WEBVTT/.test(buf.slice(0,20).toString())?'.vtt':/\.ass(\?|$)/i.test(decodeURIComponent(s.url))?'.ass':'.srt';const name='sub'+(n++)+ext;fs.writeFileSync(path.join(dir,name),buf);subtitles.push({label:s.label||'',lang:s.lang||'',file:name})}catch(e){log('subtitle skipped',String(e&&e.message||e))}}
    const done={...meta,candidates:undefined,type:c.type==='hls'?'hls':'file',file,title:c.title||'',subtitles,size:dirSize(dir),finishedAt:Date.now()}
    writeMeta(meta.id,done);job.meta=done;job.state='done';job.progress=1;return
   }catch(e){if(job.abort.signal.aborted)break;errors.push(String(e&&e.message||e));log('candidate failed',c.title||'',String(e&&e.message||e));fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true})}
  }
  fs.rmSync(dir,{recursive:true,force:true})
  if(job.abort.signal.aborted){jobs.delete(meta.id);return}
  job.state='error';job.error=errors[errors.length-1]||'No downloadable stream'
 }
 async function pump(){
  if(running)return
  while(queue.length){const id=queue.shift(),job=jobs.get(id);if(!job||job.state!=='queued')continue;running=job;job.state='downloading';changed();try{await runJob(job)}catch(e){job.state='error';job.error=String(e&&e.message||e)}running=null;changed()}
 }

 function start(payload){
  const p=payload||{};if(!p.mediaId||!p.episodeUrl)throw new Error('Missing episode')
  if(!Array.isArray(p.candidates)||!p.candidates.length)throw new Error('This episode has no stream that can be downloaded.')
  const id=SAFE(p.kind)+'_'+SAFE(p.mediaId).slice(0,40)+'_'+require('crypto').createHash('sha1').update(String(p.mediaId)+'|'+String(p.episodeUrl)).digest('hex').slice(0,10)
  const cur=jobs.get(id);if(cur&&(cur.state==='queued'||cur.state==='downloading'))return{id}
  const meta={id,kind:String(p.kind||''),mediaId:String(p.mediaId),mediaName:String(p.mediaName||''),cover:String(p.cover||''),episodeUrl:String(p.episodeUrl),episodeName:String(p.episodeName||''),episodeNo:Number(p.episodeNo)||0,mediaKey:String(p.mediaKey||''),candidates:p.candidates.map(c=>({url:String(c.url),type:c.type==='hls'?'hls':'file',title:String(c.title||''),subtitles:(c.subtitles||[]).map(s=>({url:String(s.url),label:String(s.label||''),lang:String(s.lang||'')}))})).filter(c=>/^http:\/\/127\.0\.0\.1:\d+\//.test(c.url)),createdAt:Date.now()}
  if(!meta.candidates.length)throw new Error('This episode has no stream that can be downloaded.')
  jobs.set(id,{meta,state:'queued',progress:0,bytes:0,error:'',abort:new AbortController()});queue.push(id);changed();pump();return{id}
 }
 function list(){
  const out=[],seen=new Set()
  for(const j of jobs.values()){if(j.state==='done')continue;seen.add(j.meta.id);const {candidates,...m}=j.meta;out.push({...m,state:j.state,progress:j.progress,bytes:j.bytes,error:j.error})}
  let names=[];try{names=fs.readdirSync(root)}catch{}
  for(const id of names){if(seen.has(id))continue;const m=readMeta(id);if(m&&m.file&&!m.candidates)out.push({...m,state:'done',progress:1})}
  return out.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))
 }
 function cancel(id){const j=jobs.get(String(id));if(!j)return false;j.abort.abort();if(j.state==='queued'||j.state==='error')jobs.delete(j.meta.id);changed();return true}
 function remove(id){const sid=SAFE(id);cancel(sid);jobs.delete(sid);fs.rmSync(path.join(root,sid),{recursive:true,force:true});changed();return true}
 function clear(){for(const j of jobs.values())j.abort.abort();jobs.clear();queue.length=0;for(const id of fs.readdirSync(root))fs.rmSync(path.join(root,id),{recursive:true,force:true});changed();return true}
 function usage(){return{bytes:dirSize(root),count:list().filter(x=>x.state==='done').length,folder:root}}

 function serve(){
  if(server)return Promise.resolve(port)
  server=http.createServer((req,res)=>{
   res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Range');res.setHeader('Access-Control-Expose-Headers','Content-Length,Content-Range')
   if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
   let rel='';try{rel=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/,'')}catch{}
   const file=path.resolve(root,rel),inside=path.relative(root,file)
   if(!rel||inside.startsWith('..')||path.isAbsolute(inside)||path.basename(file)==='meta.json'){res.writeHead(403);return res.end()}
   fs.stat(file,(err,st)=>{
    if(err||!st.isFile()){res.writeHead(404);return res.end()}
    const type=TYPES[path.extname(file).toLowerCase()]||'application/octet-stream',m=/bytes=(\d*)-(\d*)/.exec(req.headers.range||'')
    if(m){let s=m[1]?Number(m[1]):0,e=m[2]?Number(m[2]):st.size-1;if(!m[1]&&m[2]){s=Math.max(0,st.size-Number(m[2]));e=st.size-1}e=Math.min(e,st.size-1);if(s>e){res.writeHead(416,{'Content-Range':'bytes */'+st.size});return res.end()}res.writeHead(206,{'Content-Type':type,'Content-Length':e-s+1,'Content-Range':`bytes ${s}-${e}/${st.size}`,'Accept-Ranges':'bytes'});return fs.createReadStream(file,{start:s,end:e}).pipe(res)}
    res.writeHead(200,{'Content-Type':type,'Content-Length':st.size,'Accept-Ranges':'bytes'});fs.createReadStream(file).pipe(res)
   })
  })
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{port=server.address().port;resolve(port)})})
 }
 async function base(){return 'http://127.0.0.1:'+(await serve())}
 function close(){for(const j of jobs.values())j.abort.abort();try{server&&server.close()}catch{}}
 return{start,list,cancel,remove,clear,usage,base,close,root,configure}
}
module.exports={createVideoDownloads}
