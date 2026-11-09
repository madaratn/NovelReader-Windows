// In-app updates on Android (native part: android/app/.../UpdaterPlugin.java).
// Same status shape as the PC updater (electron/app-shell.cjs), so the banner and the
// Settings block work: checks the GitHub releases at start and every 6 hours,
// downloads a newer NovelReader-<v>.apk in the background, then "Install" opens
// Android's installer (Android always asks to confirm; the library stays).
const RELEASES='https://api.github.com/repos/madaratn/NovelReader-Windows/releases?per_page=15'
type Status={state:string,version:string,next?:string,percent?:number,error?:string|null,checkedAt?:number,android?:true,needsPermission?:boolean}

const plugin=()=>(window as any).Capacitor?.Plugins?.Updater
const parts=(v:string)=>String(v).replace(/^v/,'').split(/[.-]/).slice(0,3).map(x=>parseInt(x)||0)
export function newer(a:string,b:string){const x=parts(a),y=parts(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]}return false}

export function createAndroidUpdater(version:string){
 let status:Status={state:'idle',version,android:true}
 const subs=new Set<(s:Status)=>void>()
 const set=(s:Partial<Status>)=>{status={...status,...s};for(const f of subs)try{f(status)}catch{}}
 let busy:Promise<Status>|null=null
 let listening=false
 async function check():Promise<Status>{
  if(busy)return busy
  busy=(async()=>{
   const up=plugin()
   if(!up){set({state:'unsupported'});return status}
   if(status.state==='ready')return status
   set({state:'checking',error:null})
   try{
    const r=await fetch(RELEASES,{headers:{Accept:'application/vnd.github+json'}})
    if(!r.ok)throw Error('GitHub HTTP '+r.status)
    const list=await r.json()
    let best:any=null
    for(const rel of Array.isArray(list)?list:[]){
     if(rel.draft||rel.prerelease)continue
     const apk=(rel.assets||[]).find((a:any)=>/^NovelReader-[\d.]+\.apk$/.test(a.name))
     if(!apk)continue
     const v=apk.name.replace(/^NovelReader-|\.apk$/g,'')
     if(newer(v,version)&&(!best||newer(v,best.v)))best={v,url:apk.browser_download_url,size:apk.size}
    }
    if(!best){set({state:'up-to-date',checkedAt:Date.now()});return status}
    set({state:'downloading',next:best.v,percent:0})
    if(!listening){listening=true;up.addListener?.('progress',(p:any)=>{if(status.state==='downloading')set({percent:Number(p?.percent)||0})})}
    await up.download({url:best.url,size:best.size})
    set({state:'ready',percent:100,checkedAt:Date.now()})
   }catch(e:any){set({state:'error',error:String(e?.message||e),checkedAt:Date.now()})}
   return status
  })()
  try{return await busy}finally{busy=null}
 }
 async function install(){
  const up=plugin()
  if(!up||status.state!=='ready')return status
  const r=await up.install()
  set({needsPermission:!!r?.needsPermission})
  return status
 }
 // When coming back from Android's "allow installing apps" page, continue.
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&status.needsPermission&&status.state==='ready'){plugin()?.canInstall?.().then((c:any)=>{if(c?.allowed){set({needsPermission:false});install().catch(()=>{})}}).catch(()=>{})}})
 setTimeout(()=>{check().catch(()=>{})},8000)
 setInterval(()=>{if(status.state!=='ready'&&status.state!=='downloading')check().catch(()=>{})},6*3600_000)
 return{
  updateStatus:async()=>status,
  onUpdateStatus:(cb:(s:Status)=>void)=>{subs.add(cb);return()=>{subs.delete(cb)}},
  updateCheck:()=>check(),
  updateInstall:()=>install(),
 }
}
