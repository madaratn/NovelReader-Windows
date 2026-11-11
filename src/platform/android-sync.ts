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
async function status(){
 const P=plugin();if(!P)return{enabled:false,android:true}
 const s=await P.status(),id=deviceId();let remote:any=null
 if(s.enabled){try{const x=parseSyncFile((await P.read()).text);if(x)remote={deviceName:String(x.deviceName||''),deviceId:String(x.deviceId||''),at:Number(x.at)||0}}catch{}}
 return{enabled:!!s.enabled,folder:s.file||null,file:s.file||null,remote,deviceId:id,deviceName:String(s.deviceName||'Android'),android:true}}
export const androidSync={
 syncStatus:status,
 syncChoose:async(create?:boolean)=>{try{await plugin().choose({create:!!create})}catch(e){throw clean(e)}return status()},
 syncRead:async()=>{try{return parseSyncFile((await plugin().read()).text)}catch(e){throw clean(e)}},
 syncWrite:async(data:Record<string,string>)=>{
  if(!data||typeof data!=='object')throw Error('Invalid sync data.')
  for(const[k,v]of Object.entries(data))if(typeof v!=='string')throw Error('Invalid sync data: '+k)
  const s=await plugin().status(),payload={app:'NovelReader',version:1,at:Date.now(),deviceId:deviceId(),deviceName:String(s.deviceName||'Android'),data}
  try{await plugin().write({text:JSON.stringify(payload)})}catch(e){throw clean(e)}
  return{at:payload.at}},
 syncDisable:async()=>{await plugin().disable();return status()},
}
