// Offline video downloads (anime / series / movies).
//
// The renderer resolves an episode to one or more candidate streams (engine proxy
// URLs: /api/v1/hls?… for HLS, /api/v1/proxy?… for direct files) and queues it.
// Downloads run one at a time in the main process:
//   - direct file  -> <dir>/<part>/video.<ext>
//   - HLS          -> every segment / key / init section of the best variant (and
//                     its audio renditions) saved next to a rewritten local playlist.
// External subtitles are saved too. Finished downloads are served by a small HTTP
// server bound to 127.0.0.1 so hls.js and <video> play them like any stream.
//
// A download that is cut does not start over. Each stream is saved in its own part
// (<dir>/p<hash of where it comes from>): a connection that goes silent is dropped
// and tried again, a direct file goes on from the byte it stopped at (Range), an HLS
// stream keeps the segments it has. The part stays when every stream failed or the
// app closed, and the next try (the renderer asks again, with fresh links) goes on
// from it; a part nobody came back to is deleted after a week.
const fs=require('fs')
const path=require('path')
const http=require('http')
const crypto=require('crypto')

const SAFE=s=>String(s||'').replace(/[^a-z0-9._-]+/gi,'_').slice(0,80)
const TYPES={'.m3u8':'application/vnd.apple.mpegurl','.ts':'video/mp2t','.m4s':'video/iso.segment','.mp4':'video/mp4','.m4a':'audio/mp4','.aac':'audio/aac','.vtt':'text/vtt','.srt':'text/plain','.ass':'text/plain','.key':'application/octet-stream','.mkv':'video/x-matroska','.webm':'video/webm'}

// Query fields that change at every visit (signatures, expiry dates): left out when
// two links are compared to know whether they lead to the same file.
const VOLATILE=/^(t|ts|time|e|exp|expires?|expiry|s|sig|sign|signature|st|token|tok|auth|hash|md5|hmac|verify|nonce|session|sid|ip|policy|key-pair-id|hdnea|hdnts|hdntl|wmsauthsign|validfrom|validto|x-amz-.*|x-goog-.*)$/i
// Where a stream really comes from: the path on its own server (engine links carry
// it in ?url=), without the server name (they rotate) and without the fields above.
const pathOf=u=>{try{let x=new URL(u);const up=x.searchParams.get('url');if(up&&/^https?:/i.test(up))x=new URL(up);const q=[...x.searchParams].filter(([k])=>!VOLATILE.test(k)).map(([k,v])=>k+'='+v).sort().join('&');return x.pathname+(q?'?'+q:'')}catch{return String(u)}}
const sha=s=>crypto.createHash('sha1').update(String(s)).digest('hex')
const WEEK=7*24*3600e3

function createVideoDownloads({root,log=()=>{},notify=()=>{},fetchImpl=globalThis.fetch,stallMs=30000,retryMs=600,patienceMs=90000}){
 fs.mkdirSync(root,{recursive:true})
 const jobs=new Map() // id -> {meta, state, progress, error, abort}
 const queue=[]
 let running=null,server=null,port=0,closing=false
 // Settings: max height of the HLS variant kept (0 = best up to 1080p) and a
 // bandwidth cap in bytes per second shared by all downloads (0 = no limit).
 const settings={maxHeight:0,limit:0}
 let budgetAt=Date.now(),budget=0
 const pause=(ms,signal)=>new Promise((res,rej)=>{if(signal&&signal.aborted)return rej(new Error('aborted'));const stop=()=>{clearTimeout(tm);rej(new Error('aborted'))},tm=setTimeout(()=>{signal&&signal.removeEventListener('abort',stop);res()},ms);signal&&signal.addEventListener('abort',stop,{once:true})})
 async function throttle(bytes,signal){
  if(!settings.limit)return
  const now=Date.now();budget=Math.max(0,budget-(now-budgetAt)*settings.limit/1000);budgetAt=now;budget+=bytes
  const wait=budget/settings.limit*1000-200
  if(wait>0)await pause(Math.min(wait,30000),signal)
 }
 function configure(o){const p=o||{};if(p.maxHeight!=null)settings.maxHeight=Math.max(0,Number(p.maxHeight)||0);if(p.limit!=null)settings.limit=Math.max(0,Number(p.limit)||0);return{...settings}}

 const metaFile=id=>path.join(root,id,'meta.json')
 const readMeta=id=>{try{return JSON.parse(fs.readFileSync(metaFile(id),'utf8'))}catch{return null}}
 const writeMeta=(id,meta)=>fs.writeFileSync(metaFile(id),JSON.stringify(meta,null,1))
 const dirSize=dir=>{let n=0;try{for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);n+=f.isDirectory()?dirSize(p):fs.statSync(p).size}}catch{}return n}
 const newest=dir=>{let n=0;try{n=fs.statSync(dir).mtimeMs;for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);n=Math.max(n,f.isDirectory()?newest(p):fs.statSync(p).mtimeMs)}}catch{}return n}
 const names=dir=>{try{return fs.readdirSync(dir)}catch{return[]}}
 // Best effort: on Windows a file still being written cannot always go at once. The
 // download that is being cancelled deletes its folder again once its file is closed,
 // and what could still be left is cleared at the next start.
 const drop=p=>{try{fs.rmSync(p,{recursive:true,force:true,maxRetries:2,retryDelay:40})}catch(e){log('not deleted yet',String(e&&e.message||e))}}
 // Nothing is announced while the app closes: the downloads stopped then are not cancelled ones.
 const changed=()=>{if(!closing)notify()}
 // One stream of a download is saved in its own part of the folder, named after
 // where it comes from: the same stream offered again goes on from what is there.
 const partOf=c=>'p'+sha(c.type+'|'+pathOf(c.url)).slice(0,10)
 const isPart=f=>/^p[0-9a-f]{10}$/.test(f)
 const hasData=dir=>names(dir).some(f=>{if(/(resume\.json|\.part|\.m3u8)$/.test(f))return false;try{return fs.statSync(path.join(dir,f)).size>0}catch{return false}})
 // Left by an earlier run: a folder that holds neither a finished download (its
 // meta.json, even one that cannot be read: never delete what may be a whole video)
 // nor a part to go on from is deleted, and so is a part nobody came back to for a week.
 try{for(const d of fs.readdirSync(root,{withFileTypes:true})){if(!d.isDirectory())continue;const dir=path.join(root,d.name);if(fs.existsSync(metaFile(d.name)))continue;if(!names(dir).some(f=>isPart(f)&&hasData(path.join(dir,f)))||Date.now()-newest(dir)>WEEK)drop(dir)}}catch(e){log('cleanup skipped',String(e&&e.message||e))}

 const httpError=r=>{const e=new Error('HTTP '+r.status);e.status=r.status;return e}
 // The server said no: asking again would get the same answer.
 const fatal=e=>!!e&&((e.status>=400&&e.status<500&&e.status!==408&&e.status!==429)||e.code==='ENOSPC')
 // One request. It is dropped when nothing arrives for `stallMs`: a connection that
 // went silent used to keep its download, and the whole queue behind it, waiting for ever.
 async function request(url,signal,headers,onHead,onChunk){
  const ctl=new AbortController(),stop=()=>ctl.abort()
  if(signal){if(signal.aborted)ctl.abort();else signal.addEventListener('abort',stop,{once:true})}
  let timer=null,stalled=false
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>{stalled=true;ctl.abort()},stallMs)}
  try{
   arm();const r=await fetchImpl(url,{signal:ctl.signal,headers});arm()
   await onHead(r)
   // The clock stops while a piece is being written (or held back by the speed limit).
   if(r.body)for await(const chunk of r.body){clearTimeout(timer);await onChunk(chunk);arm()}
  }catch(e){if(stalled&&!(signal&&signal.aborted)){const s=new Error('The server stopped answering');s.stalled=true;throw s}throw e}
  finally{clearTimeout(timer);signal&&signal.removeEventListener('abort',stop);ctl.abort()}
 }
 // After a failure: stop at once when the server said no or the download was cancelled;
 // after a few quick tries while nothing is saved yet (a dead server must give way to
 // the next one fast); after `patienceMs` once the download is under way, so that a
 // short cut of the connection does not throw away what is saved.
 async function waitOrGiveUp(e,st,signal,job,quick){
  if((signal&&signal.aborted)||fatal(e))throw e
  if(!st.since)st.since=Date.now()
  if(job&&job.bytes>0?Date.now()-st.since>=patienceMs:st.fails>=quick)throw e
  await pause(Math.min(15000,retryMs*2**Math.min(st.fails,5)),signal);st.fails++
 }
 // A small resource kept in memory (playlist, key, segment, subtitle).
 async function get(url,signal,asText,job){
  const st={fails:0,since:0}
  for(;;){
   try{const parts=[];await request(url,signal,undefined,r=>{if(!r.ok)throw httpError(r)},c=>{parts.push(c)});const buf=Buffer.concat(parts);return asText?buf.toString('utf8'):buf}
   catch(e){await waitOrGiveUp(e,st,signal,job,asText?1:3)}
  }
 }
 // A direct file, written as it arrives. When the connection drops or goes silent the
 // file goes on from the byte it stopped at (Range) instead of starting over; the
 // same on a later try, as long as the file still has the same length.
 async function saveStream(url,file,job,onBytes){
  const signal=job.signal,mark=file+'.resume.json',st={fails:0,since:0},again=()=>{const e=new Error('again');e.again=true;return e}
  let got=0,total=0
  try{total=Number(JSON.parse(fs.readFileSync(mark,'utf8')).total)||0;got=total?fs.statSync(file).size:0}catch{got=0}
  if(!total||got>total){got=0;total=0}
  if(got)onBytes(got,total)
  while(!total||got<total){
   let out=null
   try{
    try{
     await request(url,signal,got?{Range:'bytes='+got+'-'}:undefined,r=>{
      if(got&&r.status===416){got=0;total=0;throw again()}
      if(!r.ok)throw httpError(r)
      if(got){
       const m=/bytes\s+(\d+)-\d*\/(\d+|\*)/i.exec(r.headers.get('content-range')||'')
       if(r.status!==206){got=0;total=0} // the whole file is sent again: taken from the start
       else if(!m||Number(m[1])!==got||(total&&m[2]!=='*'&&Number(m[2])!==total)){got=0;total=0;throw again()} // not the same file any more
       else if(!total&&m[2]!=='*')total=Number(m[2])
      }
      // (A compressed answer does not say how long the file itself is.)
      if(!got){total=r.headers.get('content-encoding')?0:Number(r.headers.get('content-length'))||0;if(total)fs.writeFileSync(mark,JSON.stringify({total}));else fs.rmSync(mark,{force:true})}
      out=fs.createWriteStream(file,{flags:got?'a':'w'});out.on('error',()=>{})
     },async chunk=>{await new Promise((res,rej)=>out.write(chunk,e=>e?rej(e):res()));got+=chunk.length;st.fails=0;st.since=0;onBytes(got,total);await throttle(chunk.length,signal)})
    }finally{if(out&&!out.destroyed)await new Promise(res=>out.end(()=>res()))}
    if(!total)break // length not given: the end of the answer is the end of the file
    if(got<total)throw new Error('The connection was cut')
   }catch(e){if(e&&e.again)continue;await waitOrGiveUp(e,st,signal,job,3)}
  }
  if(!got)throw new Error('Empty file')
  return got
 }
 const attr=(line,name)=>{const m=new RegExp(name+'=("([^"]*)"|[^,]*)').exec(line);return m?(m[2]!=null?m[2]:m[1]):''}

 // Download one media playlist into dir/<prefix>…; returns the local playlist file name.
 async function mediaPlaylist(url,dir,prefix,job,weight){
  const text=await get(url,job.signal,true,job)
  const lines=text.split(/\r?\n/),out=[],files=new Map(),tasks=[]
  const local=(uri,ext,fixed)=>{const abs=new URL(uri,url).toString();if(!files.has(abs)){const name=prefix+files.size+ext;files.set(abs,name);tasks.push({abs,name,fixed})}return files.get(abs)}
  const extOf=(uri,def)=>{try{const e=path.extname(new URL(uri,url).pathname).toLowerCase();return TYPES[e]&&e!=='.m3u8'?e:def}catch{return def}}
  for(const line of lines){
   if(/^#EXT-X-(KEY|MAP|SESSION-KEY):/.test(line)&&/URI="/.test(line)){const uri=attr(line,'URI');out.push(line.replace(/URI="[^"]*"/,'URI="'+local(uri,/^#EXT-X-MAP/.test(line)?'.mp4':'.key',true)+'"'));continue}
   if(line&&!line.startsWith('#')){out.push(local(line.trim(),extOf(line.trim(),'.ts'),false));continue}
   out.push(line)
  }
  if(!tasks.length)throw new Error('Empty playlist')
  // What an earlier try saved is kept when this is the same list of files in the same
  // order (the links may carry new tokens). Anything else starts this list over.
  const mark=path.join(dir,prefix+'resume.json'),sig=sha(tasks.map(t=>pathOf(t.abs)).join('\n'))
  const mine=()=>names(dir).filter(f=>f.startsWith(prefix)&&/^\d/.test(f.slice(prefix.length)))
  let keep=false;try{keep=JSON.parse(fs.readFileSync(mark,'utf8')).sig===sig}catch{}
  const wipe=()=>{for(const f of mine())drop(path.join(dir,f));keep=false}
  if(!keep)wipe();else for(const f of mine())if(f.endsWith('.part'))drop(path.join(dir,f))
  fs.writeFileSync(mark,JSON.stringify({sig}))
  // A file is complete or absent: written under another name, then given its own.
  const save=(name,buf)=>{const f=path.join(dir,name);fs.writeFileSync(f+'.part',buf);fs.renameSync(f+'.part',f)}
  // Keys and init sections are small and always fetched again: with another key, the
  // segments already here could not be read.
  const fixed=[];for(const t of tasks)if(t.fixed)fixed.push([t,await get(t.abs,job.signal,false,job)])
  if(keep&&fixed.some(([t,buf])=>{try{return!fs.readFileSync(path.join(dir,t.name)).equals(buf)}catch{return true}}))wipe()
  for(const[t,buf]of fixed)save(t.name,buf)
  let done=fixed.length;const q=[]
  for(const t of tasks)if(!t.fixed){let size=0;if(keep)try{size=fs.statSync(path.join(dir,t.name)).size}catch{};if(size){done++;job.bytes+=size}else q.push(t)}
  const step=()=>{job.progress=Math.min(0.99,job.base+weight*done/tasks.length);job.tick()}
  step()
  // Four at a time. The first failure stops the others: they used to go on writing
  // into the folder while the next stream was already being saved there.
  let failure=null
  await Promise.all(Array.from({length:4},async()=>{while(q.length&&!failure&&!job.signal.aborted){const t=q.shift();try{const buf=await get(t.abs,job.signal,false,job);if(job.signal.aborted)break;save(t.name,buf);job.bytes+=buf.length;done++;step();await throttle(buf.length,job.signal)}catch(e){if(!failure){failure=e;job.stop()}}}}))
  if(failure)throw failure
  if(job.signal.aborted)throw new Error('aborted')
  job.base+=weight
  const name=prefix+'index.m3u8';fs.writeFileSync(path.join(dir,name),out.join('\n'));return name
 }

 async function downloadHls(url,dir,job){
  const text=await get(url,job.signal,true,job)
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
  fs.mkdirSync(dir,{recursive:true})
  let lastTick=0;job.tick=()=>{const now=Date.now();if(now-lastTick>500){lastTick=now;changed()}}
  // Parts of streams that are not offered any more cannot be gone on from.
  const wanted=new Set((meta.candidates||[]).map(partOf))
  for(const f of names(dir))if(!wanted.has(f))drop(path.join(dir,f))
  const errors=[]
  for(const c of meta.candidates||[]){
   if(job.abort.signal.aborted)break
   const part=partOf(c),pdir=path.join(dir,part)
   // Each stream gets its own signal: when it fails, what it still had under way stops.
   const attempt=new AbortController(),stop=()=>attempt.abort()
   job.abort.signal.addEventListener('abort',stop,{once:true});job.signal=attempt.signal;job.stop=stop
   try{
    fs.mkdirSync(pdir,{recursive:true})
    job.base=0;job.bytes=0;job.progress=0;let file
    if(c.type==='hls')file=await downloadHls(c.url,pdir,job)
    else{const em=/\.(mkv|webm)(\?|&|$)/i.exec(decodeURIComponent(c.url)),ext=em?'.'+em[1].toLowerCase():'.mp4';file='video'+ext;await saveStream(c.url,path.join(pdir,file),job,(got,total)=>{job.bytes=got;job.progress=total?Math.min(0.99,got/total):0;job.tick()})}
    const subtitles=[];let n=0
    for(const s of (c.subtitles||[]).slice(0,8)){try{const buf=await get(s.url,job.signal,false,null);const ext=/^\s*WEBVTT/.test(buf.slice(0,20).toString())?'.vtt':/\.ass(\?|$)/i.test(decodeURIComponent(s.url))?'.ass':'.srt';const name='sub'+(n++)+ext;fs.writeFileSync(path.join(pdir,name),buf);subtitles.push({label:s.label||'',lang:s.lang||'',file:part+'/'+name})}catch(e){if(job.abort.signal.aborted)throw e;log('subtitle skipped',String(e&&e.message||e))}}
    // Done: the parts of the other streams and the notes for going on are not needed any more.
    for(const f of names(dir))if(f!==part)drop(path.join(dir,f))
    for(const f of names(pdir))if(/(resume\.json|\.part)$/.test(f))drop(path.join(pdir,f))
    const done={...meta,candidates:undefined,type:c.type==='hls'?'hls':'file',file:part+'/'+file,title:c.title||'',subtitles,size:dirSize(dir),finishedAt:Date.now()}
    writeMeta(meta.id,done);job.meta=done;job.state='done';job.progress=1;return
   }catch(e){
    if(job.abort.signal.aborted)break
    const full=!!e&&e.code==='ENOSPC'
    errors.push(full?'No space left on the disk':String(e&&e.message||e));log('candidate failed',c.title||'',String(e&&e.message||e))
    // What was saved stays for the next try; a part with nothing in it goes.
    if(!hasData(pdir))drop(pdir)
    if(full)break
   }finally{attempt.abort();job.abort.signal.removeEventListener('abort',stop)}
  }
  // Cancelled: nothing is kept. The app closing is not a cancellation: the part stays.
  if(closing)return
  // (Unless the same episode was asked for again meanwhile: the folder and the place in the list are its own now.)
  if(job.abort.signal.aborted){const now=jobs.get(meta.id);if(!now||now===job){drop(dir);jobs.delete(meta.id)}return}
  if(!names(dir).length)drop(dir)
  job.state='error';job.error=errors[errors.length-1]||'No downloadable stream'
 }
 async function pump(){
  if(running)return
  while(queue.length&&!closing){const id=queue.shift(),job=jobs.get(id);if(!job||job.state!=='queued')continue;running=job;job.state='downloading';changed();try{await runJob(job)}catch(e){job.state='error';job.error=String(e&&e.message||e)}running=null;changed()}
 }

 function start(payload){
  const p=payload||{};if(!p.mediaId||!p.episodeUrl)throw new Error('Missing episode')
  if(!Array.isArray(p.candidates)||!p.candidates.length)throw new Error('This episode has no stream that can be downloaded.')
  const id=SAFE(p.kind)+'_'+SAFE(p.mediaId).slice(0,40)+'_'+require('crypto').createHash('sha1').update(String(p.mediaId)+'|'+String(p.episodeUrl)).digest('hex').slice(0,10)
  const cur=jobs.get(id);if(cur&&!cur.abort.signal.aborted&&(cur.state==='queued'||cur.state==='downloading'))return{id}
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
 // Cancelling leaves nothing behind (a failed download keeps its part until then).
 function cancel(id){const j=jobs.get(String(id));if(!j)return false;j.abort.abort();if(j.state==='queued'||j.state==='error'){jobs.delete(j.meta.id);drop(path.join(root,j.meta.id))}changed();return true}
 function remove(id){const sid=SAFE(id);cancel(sid);jobs.delete(sid);drop(path.join(root,sid));changed();return true}
 function clear(){for(const j of jobs.values())j.abort.abort();jobs.clear();queue.length=0;for(const id of names(root))drop(path.join(root,id));changed();return true}
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
 function close(){closing=true;for(const j of jobs.values())j.abort.abort();try{server&&server.close()}catch{}}
 return{start,list,cancel,remove,clear,usage,base,close,root,configure}
}
module.exports={createVideoDownloads,pathOf}
