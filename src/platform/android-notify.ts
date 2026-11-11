// Notifications on Android (NotifyPlugin.java): shown by the interface when the app
// is in the background, and by a check every 6 hours when it is closed
// (EpisodeCheckWorker.java, which reads the list sent here).
import{TNTV_ID}from'../features/tn-tv'
const plugin=()=>(window as any).Capacitor?.Plugins?.Notify
export const deviceNotify=()=>!!plugin()
export async function askNotifications(){try{return!!(await plugin()?.request())?.granted}catch{return false}}
// True when the notification was handed to Android (the caller then skips the PC way).
export function showDeviceNotification(id:number,title:string,body:string){
 const P=plugin();if(!P)return false
 if(document.visibilityState!=='visible')P.show({id,title,body}).catch(()=>{})
 return true}
// What the closed-app check needs: title, source, address, episodes known today.
export function watchItems(libs:any[][]){
 return libs.flat().filter((a:any)=>a&&a.shelf!=='dropped'&&a.sourceId&&(a.url||a.path)&&String(a.sourceId)!==TNTV_ID)
  .map((a:any)=>({name:String(a.name||a.title||''),sourceId:String(a.sourceId),url:String(a.url||a.path),episodes:Number(a.episodes)||0})).slice(0,300)}
let timer:any=0
export function syncWatchlist(libs:any[][]){
 const P=plugin();if(!P)return
 clearTimeout(timer);timer=setTimeout(()=>{
  const on=(a:string,b:string)=>localStorage.getItem(a)!=='0'&&localStorage.getItem(b)!=='0'
  // Episodes: the list below. Chapters: the hidden page reads the library itself; it only needs the check to be scheduled.
  const items=on('autoCheckEpisodes','notifyNewEpisodes')?watchItems(libs):[]
  let books=0;try{books=JSON.parse(localStorage.getItem('library')||'[]').length}catch{}
  P.watch({items:JSON.stringify(items),enabled:items.length>0||(books>0&&on('autoCheckUpdates','notifyNewChapters'))}).catch(()=>{})},3000)}
