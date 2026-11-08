// Interface updates without closing NovelReader.
// Most releases only change the interface (dist/). Each release also publishes
// ui.json + ui-<version>.json.gz (scripts/ui-bundle.mjs). When the new release
// was built with exactly the same main-process code ("shell": electron/*.cjs), the new interface is downloaded from the official
// GitHub release, checked (SHA-512 of the file, listed in ui.json), unpacked in
// the profile folder and loaded by reloading the window. Anything else waits for
// the normal update (installed silently when the app closes).
// Safety: if a downloaded interface does not start (no "ok" from the page), the
// next start goes back to the interface shipped with the app and skips that version.
const fs=require('fs')
const path=require('path')
const zlib=require('zlib')
const crypto=require('crypto')

const LATEST='https://github.com/madaratn/NovelReader-Windows/releases/latest/download/'

// Fingerprint of the main-process side: an interface is only swapped when it was
// built against the very same one. (Library upgrades still arrive with the full
// update, installed when the app closes.)
function shellId(appDir){
 const h=crypto.createHash('sha256')
 const dir=path.join(appDir,'electron')
 for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.cjs')).sort()){h.update(f+'\n');h.update(fs.readFileSync(path.join(dir,f)))}
 return h.digest('hex').slice(0,32)
}
const newer=(a,b)=>{const pa=String(a).split('.').map(Number),pb=String(b).split('.').map(Number);for(let i=0;i<3;i++){if((pa[i]||0)!==(pb[i]||0))return(pa[i]||0)>(pb[i]||0)}return false}

function createUiUpdate({app,base=LATEST,fetchImpl=globalThis.fetch,log=console,appDir=app.getAppPath()}){
 const root=()=>path.join(app.getPath('userData'),'ui')
 const stateFile=()=>path.join(root(),'state.json')
 const read=()=>{try{return JSON.parse(fs.readFileSync(stateFile(),'utf8'))||{}}catch{return{}}}
 const write=s=>{fs.mkdirSync(root(),{recursive:true});fs.writeFileSync(stateFile(),JSON.stringify(s))}
 let shell='';try{shell=shellId(appDir)}catch(e){log.warn&&log.warn('[ui-update] no shell id',e)}
 let loaded=app.getVersion(),status={state:'idle'},listeners=new Set()
 const emit=p=>{status={state:p.state,...p};for(const f of listeners)f(status);return status}
 // Which index.html to open at start.
 function entry(){
  const packaged=path.join(appDir,'dist','index.html'),s=read()
  const a=s.active
  const usable=a&&a.shell===shell&&newer(a.version,app.getVersion())&&!(s.bad||[]).includes(a.version)&&fs.existsSync(path.join(root(),a.version,'index.html'))
  if(!usable){if(a){delete s.active;s.booting=false;write(s)}loaded=app.getVersion();return packaged}
  if(s.booting){(s.bad=s.bad||[]).push(a.version);delete s.active;s.booting=false;write(s);log.warn&&log.warn('[ui-update] interface',a.version,'did not start; back to the built-in one');loaded=app.getVersion();return packaged}
  s.booting=true;write(s);loaded=a.version
  return path.join(root(),a.version,'index.html')
 }
 function ok(){const s=read();if(s.booting){s.booting=false;write(s)}cleanup();return true}
 function cleanup(){try{const s=read(),keep=new Set([s.active?.version,s.pending].filter(Boolean));for(const d of fs.readdirSync(root()))if(/^\d+\.\d+\.\d+(\.tmp)?$/.test(d)&&!keep.has(d))fs.rmSync(path.join(root(),d),{recursive:true,force:true})}catch{}}
 async function check(){
  if(!shell||status.state==='downloading')return status
  try{
   const r=await fetchImpl(base+'ui.json',{cache:'no-store'});if(!r.ok)throw new Error('ui.json HTTP '+r.status)
   const m=await r.json()
   const s=read()
   if(!m||!/^\d+\.\d+\.\d+$/.test(m.version)||!newer(m.version,loaded))return emit({state:'idle'})
   if(m.shell!==shell)return emit({state:'needs-restart',version:m.version}) // main-process code changed: normal update
   if((s.bad||[]).includes(m.version))return emit({state:'idle'})
   if(s.pending===m.version&&fs.existsSync(path.join(root(),m.version,'index.html')))return emit({state:'ready',version:m.version})
   emit({state:'downloading',version:m.version})
   const f=await fetchImpl(base+String(m.file||('ui-'+m.version+'.json.gz')));if(!f.ok)throw new Error('bundle HTTP '+f.status)
   const gz=Buffer.from(await f.arrayBuffer())
   if(crypto.createHash('sha512').update(gz).digest('base64')!==m.sha512)throw new Error('bundle checksum mismatch')
   const b=JSON.parse(zlib.gunzipSync(gz).toString('utf8'))
   if(b.version!==m.version||b.shell!==shell||!b.files||!b.files['index.html'])throw new Error('bundle does not match ui.json')
   const tmp=path.join(root(),m.version+'.tmp'),dest=path.join(root(),m.version)
   fs.rmSync(tmp,{recursive:true,force:true})
   for(const[rel,data]of Object.entries(b.files)){
    const out=path.resolve(tmp,rel);if(!out.startsWith(path.resolve(tmp)+path.sep))throw new Error('bad path in bundle')
    fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,Buffer.from(String(data),'base64'))}
   fs.rmSync(dest,{recursive:true,force:true});fs.renameSync(tmp,dest)
   const s2=read();s2.pending=m.version;write(s2)
   return emit({state:'ready',version:m.version})
  }catch(e){log.warn&&log.warn('[ui-update]',String(e&&e.message||e));return emit({state:'error',error:String(e&&e.message||e)})}
 }
 // Switch to the downloaded interface: returns the index.html to load.
 function apply(){const s=read();if(!s.pending||!fs.existsSync(path.join(root(),s.pending,'index.html')))return null;s.active={version:s.pending,shell};delete s.pending;s.booting=true;write(s);loaded=s.active.version;emit({state:'applied',version:loaded});return path.join(root(),loaded,'index.html')}
 return{entry,ok,check,apply,version:()=>loaded,status:()=>status,onStatus:f=>{listeners.add(f);return()=>listeners.delete(f)},shell:()=>shell}
}
module.exports={createUiUpdate,shellId,newer}
