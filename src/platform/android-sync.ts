// Sync with the PC on Android: the same library-sync.json as on Windows
// (electron/sync.cjs), opened through Android's file picker (SyncPlugin.java), so a
// file in Google Drive / OneDrive is shared with the PC. Merging is the interface's.
const plugin=()=>(window as any).Capacitor?.Plugins?.Sync
const deviceId=()=>{let id=localStorage.getItem('syncDeviceId');if(!id){id=Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('syncDeviceId',id)}return id}
const clean=(e:any)=>Error(String(e?.message||e))
// Same checks as the PC. An empty file (just created) is "nothing yet".
export function parseSyncFile(text:string){
 if(!String(text||'').trim())return null
 let x:any;try{x=JSON.parse(text)}catch{throw Error('The sync file is damaged. It will be rewritten from this PC.')}
 if(!x||x.app!=='NovelReader'||typeof x.data!=='object'||!x.data)throw Error('The sync file is not a NovelReader file.')
 for(const[k,v]of Object.entries(x.data))if(typeof k!=='string'||typeof v!=='string')throw Error('The sync file is damaged.')
 return x}
// Two ways: directly with the linked PC on the home Wi-Fi (electron/engine-share.cjs,
// /nr/sync), or a file in Google Drive / OneDrive picked on the phone (SyncPlugin).
const pc=()=>{try{return localStorage.getItem('pcEngine')||''}catch{return''}}
const pcName=()=>pc().replace(/^http:\/\//,'').replace(/\/e\/.*$/,'')
const AWAY='Your PC is not reachable right now. Sync resumes on the home Wi-Fi, with NovelReader open on the PC.'
async function pcCall(method:string,body?:string){
 const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),15000)
 try{const r=await fetch(pc()+'/nr/sync',{method,signal:ctl.signal,headers:body?{'Content-Type':'application/json'}:undefined,body})
  if(r.status===404)throw Error('The PC refused the code. Link it again in Settings.')
  const text=await r.text();if(!r.ok){let m='';try{m=JSON.parse(text).error}catch{}throw Error(m||'HTTP '+r.status)}
  return text}
 catch(e:any){if(e?.name==='AbortError'||e instanceof TypeError||/Failed to fetch|Load failed|network/i.test(String(e?.message)))throw Error(AWAY);throw e}
 finally{clearTimeout(tm)}}
const deviceName=async()=>{try{return String((await plugin()?.status())?.deviceName||'')}catch{return''}}
async function status(){
 const id=deviceId(),name=(await deviceName())||(document.documentElement.classList.contains('ios')?'iPhone':'Android')
 if(pc()){let remote:any=null;try{const x=parseSyncFile(await pcCall('GET'));if(x)remote={deviceName:String(x.deviceName||''),deviceId:String(x.deviceId||''),at:Number(x.at)||0}}catch{}
  return{enabled:true,direct:true,folder:pcName(),file:pcName(),remote,deviceId:id,deviceName:name,android:true}}
 const P=plugin();if(!P)return{enabled:false,android:true,deviceId:id,deviceName:name}
 const s=await P.status();let remote:any=null
 if(s.enabled){try{const x=parseSyncFile((await P.read()).text);if(x)remote={deviceName:String(x.deviceName||''),deviceId:String(x.deviceId||''),at:Number(x.at)||0}}catch{}}
 return{enabled:!!s.enabled,folder:s.file||null,file:s.file||null,remote,deviceId:id,deviceName:name,android:true}}
export const androidSync={
 syncStatus:status,
 syncChoose:async(create?:boolean)=>{try{await plugin().choose({create:!!create})}catch(e){throw clean(e)}return status()},
 syncRead:async()=>{if(pc()){const t=await pcCall('GET');return t.trim()==='null'?null:parseSyncFile(t)}try{return parseSyncFile((await plugin().read()).text)}catch(e){throw clean(e)}},
 syncWrite:async(data:Record<string,string>)=>{
  if(!data||typeof data!=='object')throw Error('Invalid sync data.')
  for(const[k,v]of Object.entries(data))if(typeof v!=='string')throw Error('Invalid sync data: '+k)
  const name=(await deviceName())||(document.documentElement.classList.contains('ios')?'iPhone':'Android'),payload={app:'NovelReader',version:1,at:Date.now(),deviceId:deviceId(),deviceName:name,data}
  if(pc()){await pcCall('POST',JSON.stringify(payload));return{at:payload.at}}
  try{await plugin().write({text:JSON.stringify(payload)})}catch(e){throw clean(e)}
  return{at:payload.at}},
 syncDisable:async()=>{if(pc())localStorage.removeItem('pcEngine');else await plugin()?.disable();return status()},
}
