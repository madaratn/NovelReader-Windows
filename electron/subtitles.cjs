// Subtitles for any video.
// 1. Online: the title is matched to its IMDb id (IMDb suggestions, no key), then
//    Wyzie Subs (free key from the user) lists the subtitles of that film or
//    episode; the chosen file is converted to WebVTT.
// 2. AI: whisper.cpp runs on this PC. ffmpeg cuts 30 s of sound from the video
//    (the local engine stream), whisper writes the lines with their times. The page
//    asks for the next pieces ahead of playback. whisper.cpp (pinned release,
//    checked by SHA-256) and its model are downloaded once.
const fs=require('fs')
const os=require('os')
const path=require('path')
const crypto=require('crypto')
const {spawn}=require('child_process')

const WHISPER_ZIP='https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip'
const WHISPER_SHA256='0d2eca299c248f965bd0341bcb219db4b433c7f0c0ce2200d4df85765e8156a9'
const MODEL_URL=size=>`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${size}.bin`
const MODEL_MIN={base:120e6,small:400e6}
const LOCAL_SRC=/^http:\/\/(127\.0\.0\.1|localhost):\d+\//i

// ---- Text helpers --------------------------------------------------------------------
function decode(buf,encoding=''){
 const enc=String(encoding||'').toLowerCase()
 if(buf[0]===0xEF&&buf[1]===0xBB&&buf[2]===0xBF)return buf.subarray(3).toString('utf8')
 if(buf[0]===0xFF&&buf[1]===0xFE)return buf.subarray(2).toString('utf16le')
 if(enc&&!/utf-?8/.test(enc)){try{return new TextDecoder(enc).decode(buf)}catch{}}
 const utf=buf.toString('utf8');if(!utf.includes('\uFFFD'))return utf
 try{return new TextDecoder('windows-1252').decode(buf)}catch{return utf}
}
function srtToVtt(text){
 let s=String(text).replace(/^\uFEFF/,'').replace(/\r/g,'')
 if(/^\s*WEBVTT/.test(s))return s
 if(/^\s*\[Script Info\]/i.test(s))return assToVtt(s)
 s=s.replace(/(\d{1,2}:\d\d:\d\d)[,.](\d{1,3})/g,(_m,a,b)=>a.padStart(8,'0')+'.'+b.padEnd(3,'0'))
 s=s.replace(/\{\\[^}]*\}/g,'')
 return 'WEBVTT\n\n'+s.trim()+'\n'
}
function assToVtt(s){
 const ts=x=>{const m=/(\d+):(\d\d):(\d\d)[.](\d\d)/.exec(x);return m?`${m[1].padStart(2,'0')}:${m[2]}:${m[3]}.${m[4]}0`:'00:00:00.000'}
 const out=['WEBVTT','']
 for(const line of s.split('\n')){if(!/^Dialogue:/i.test(line))continue;const parts=line.slice(9).split(',');if(parts.length<10)continue;const text=parts.slice(9).join(',').replace(/\{[^}]*\}/g,'').replace(/\\N/gi,'\n').trim();if(text)out.push(`${ts(parts[1])} --> ${ts(parts[2])}`,text,'')}
 return out.join('\n')
}
const vttTime=s=>{s=Math.max(0,s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${sec.toFixed(3).padStart(6,'0')}`}

function createSubtitles({app,fetchImpl=globalThis.fetch,spawnImpl=spawn,ensureFfmpeg,platform=process.platform,log=console}){
 // ---- Online -------------------------------------------------------------------------
 async function imdbFind(title,{year,kind}={}){
  const q=String(title||'').replace(/\((?:dub|sub|vf|vostfr)\)|\[[^\]]*\]/ig,'').replace(/\s+/g,' ').trim().toLowerCase()
  if(!q)throw new Error('No title')
  const r=await fetchImpl('https://v2.sg.media-imdb.com/suggestion/'+encodeURIComponent(q[0])+'/'+encodeURIComponent(q)+'.json')
  if(!r.ok)throw new Error('IMDb HTTP '+r.status)
  const d=await r.json()
  const want=kind==='movie'?/^movie|tvMovie/:/^tv(Series|MiniSeries)/
  const list=(d.d||[]).filter(x=>/^tt\d+$/.test(x.id||'')&&want.test(String(x.qid||'')))
  const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
  const hit=list.find(x=>norm(x.l)===norm(q)&&(!year||Math.abs((x.y||0)-year)<=1))||list.find(x=>norm(x.l)===norm(q))||list[0]
  return hit?{id:hit.id,title:hit.l,year:hit.y||0}:null
 }
 async function search({title,year,kind,season,episode,langs=['fr','en'],key}){
  if(!key)throw new Error('NO_KEY')
  const imdb=await imdbFind(title,{year,kind});if(!imdb)return{imdb:null,results:[]}
  const q=new URLSearchParams({id:imdb.id,key:String(key)})
  if(kind!=='movie'&&season&&episode){q.set('season',String(season));q.set('episode',String(episode))}
  if(langs.length)q.set('language',langs.join(','))
  const r=await fetchImpl('https://sub.wyzie.io/search?'+q.toString())
  if(r.status===401||r.status===403)throw new Error('BAD_KEY')
  if(r.status===429)throw new Error('LIMIT')
  if(!r.ok)throw new Error('Wyzie HTTP '+r.status)
  const list=await r.json()
  const results=(Array.isArray(list)?list:[]).filter(x=>x&&x.url&&/^(srt|vtt|ass|ssa|sub)$/i.test(String(x.format||'srt'))).map(x=>({id:String(x.id),url:String(x.url),language:String(x.language||''),display:String(x.display||x.language||''),release:String(x.release||x.fileName||''),source:String(x.source||''),format:String(x.format||'srt'),encoding:String(x.encoding||''),hi:!!x.isHearingImpaired,downloads:Number(x.downloadCount)||0}))
  results.sort((a,b)=>langs.indexOf(a.language)-langs.indexOf(b.language)||Number(a.hi)-Number(b.hi)||b.downloads-a.downloads)
  return{imdb,results}
 }
 async function fetchSub({url,encoding}){
  if(!/^https:\/\//i.test(String(url)))throw new Error('Bad subtitle address')
  const r=await fetchImpl(url);if(!r.ok)throw new Error('Subtitle HTTP '+r.status)
  const buf=Buffer.from(await r.arrayBuffer())
  if(buf.length>8e6)throw new Error('Subtitle file too big')
  if(buf[0]===0x50&&buf[1]===0x4B){ // zip
   const JSZip=require('jszip');const z=await JSZip.loadAsync(buf);const f=Object.values(z.files).find(f=>/\.(srt|vtt|ass|ssa)$/i.test(f.name))
   if(!f)throw new Error('No subtitle in the archive');return srtToVtt(decode(Buffer.from(await f.async('uint8array')),encoding))}
  return srtToVtt(decode(buf,encoding))
 }
 // ---- AI (whisper.cpp) ----------------------------------------------------------------
 const dir=()=>path.join(app.getPath('userData'),'tools','whisper')
 const cliPath=()=>path.join(dir(),'Release',platform==='win32'?'whisper-cli.exe':'whisper-cli')
 const modelPath=size=>path.join(dir(),'ggml-'+size+'.bin')
 async function download(url,dest,onProgress,{sha256,min}={}){
  fs.mkdirSync(path.dirname(dest),{recursive:true})
  const r=await fetchImpl(url);if(!r.ok||!r.body)throw new Error('Download failed (HTTP '+r.status+')')
  const total=Number(r.headers.get('content-length'))||0,part=dest+'.part',out=fs.createWriteStream(part),h=crypto.createHash('sha256')
  let got=0;const reader=r.body.getReader()
  for(;;){const{done,value}=await reader.read();if(done)break;got+=value.length;h.update(value);if(!out.write(Buffer.from(value)))await new Promise(x=>out.once('drain',x));onProgress&&onProgress(total?got/total:0)}
  await new Promise((res,rej)=>out.end(e=>e?rej(e):res()))
  if(sha256&&h.digest('hex')!==sha256){fs.rmSync(part,{force:true});throw new Error('Download check failed')}
  if(min&&got<min){fs.rmSync(part,{force:true});throw new Error('Download incomplete')}
  fs.renameSync(part,dest)
 }
 let preparing=null
 async function haveCli(){
  if(fs.existsSync(cliPath()))return cliPath()
  if(platform!=='win32'){const ok=await new Promise(res=>{try{const c=spawnImpl('whisper-cli',['--help'],{windowsHide:true});c.on('error',()=>res(false));c.on('close',()=>res(true))}catch{res(false)}});if(ok)return'whisper-cli'}
  return null
 }
 function prepare(size='base',onProgress){
  if(preparing)return preparing
  preparing=(async()=>{
   const ff=await ensureFfmpeg(p=>onProgress&&onProgress({step:'ffmpeg',p}))
   let cli=await haveCli()
   if(!cli){
    const zip=path.join(dir(),'whisper-bin-x64.zip')
    await download(WHISPER_ZIP,zip,p=>onProgress&&onProgress({step:'whisper',p}),{sha256:WHISPER_SHA256})
    const JSZip=require('jszip');const z=await JSZip.loadAsync(fs.readFileSync(zip))
    for(const f of Object.values(z.files)){if(f.dir||!/^Release\/(whisper-cli\.exe|[^/]+\.dll)$/i.test(f.name))continue;const out=path.join(dir(),f.name);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,Buffer.from(await f.async('uint8array')))}
    fs.rmSync(zip,{force:true});cli=cliPath()
   }
   if(!fs.existsSync(modelPath(size)))await download(MODEL_URL(size),modelPath(size),p=>onProgress&&onProgress({step:'model',p}),{min:MODEL_MIN[size]||50e6})
   return{ff,cli,model:modelPath(size)}
  })().finally(()=>{preparing=null})
  return preparing
 }
 const run=(cmd,args)=>new Promise((res,rej)=>{let err='';const c=spawnImpl(cmd,args,{windowsHide:true});c.stderr&&c.stderr.on('data',d=>{err=(err+String(d)).slice(-2000)});c.on('error',rej);c.on('close',code=>code===0?res():rej(new Error((path.basename(String(cmd))+' failed: '+err.trim().split('\n').pop()).slice(0,300))))})
 let queue=Promise.resolve()
 // One piece of sound -> lines [{start,end,text}] in video time.
 function transcribe({src,start=0,dur=30,lang='auto',size='base'}){
  if(!LOCAL_SRC.test(String(src)))return Promise.reject(new Error('Only local streams can be transcribed'))
  const job=queue.then(async()=>{
   const{ff,cli,model}=await prepare(size)
   const tmp=path.join(os.tmpdir(),'nr-whisper-'+crypto.randomBytes(6).toString('hex'))
   try{
    await run(ff,['-hide_banner','-loglevel','error','-y','-ss',String(start),'-t',String(dur),'-i',src,'-vn','-ac','1','-ar','16000','-f','wav',tmp+'.wav'])
    const threads=Math.max(1,Math.min(8,(os.cpus()||[]).length-1||1))
    await run(cli,['-m',model,'-f',tmp+'.wav','-l',String(lang||'auto'),'-oj','-of',tmp,'-t',String(threads),'-np'])
    const j=JSON.parse(fs.readFileSync(tmp+'.json','utf8'))
    const lines=(j.transcription||[]).map(x=>({start:start+(Number(x.offsets?.from)||0)/1000,end:start+(Number(x.offsets?.to)||0)/1000,text:String(x.text||'').trim()})).filter(x=>x.text&&!/^\[.*\]$|^\(.*\)$|^♪+$/.test(x.text))
    return{lines,language:String(j.result?.language||lang||'')}
   }finally{for(const e of['.wav','.json'])fs.rmSync(tmp+e,{force:true})}
  })
  queue=job.catch(()=>{})
  return job
 }
 const aiReady=(size='base')=>fs.existsSync(modelPath(size))&&(fs.existsSync(cliPath())||platform!=='win32')
 return{search,fetchSub,imdbFind,prepare,transcribe,aiReady}
}
module.exports={createSubtitles,srtToVtt,assToVtt,decode,vttTime,WHISPER_ZIP,WHISPER_SHA256}
