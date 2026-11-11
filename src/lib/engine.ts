// All calls to the video engine go through here: the app's own sources (Tunisian TV
// on YouTube) are answered in the app, everything else goes to the engine
// (window.novelReader.miwayomiFetch, on the PC and on Android).
import{TNTV_ID,TNTV_NAME,tntvEnabled,tntvFetch}from'../features/tn-tv'

export async function engineFetch(path:string,method?:string,body?:any):Promise<any>{
 const nr=(window as any).novelReader
 if(typeof path==='string'&&path.startsWith('/api/v1/anime/'+TNTV_ID+'/'))return tntvFetch(path)
 if(path==='/api/v1/sources'&&tntvEnabled()){
  let r:any;try{r=await nr.miwayomiFetch(path,method,body)}catch(e){r={manga:[],anime:[]}}
  const own={id:TNTV_ID,name:TNTV_NAME,lang:'ar',type:'anime',pkg:'novelreader.tntv',builtin:true}
  if(Array.isArray(r))return[...r,own]
  return{...r,anime:[...(r?.anime||[]),own]}
 }
 return nr.miwayomiFetch(path,method,body)
}

// Where the video streams are fetched: the engine of this device, or on an iPhone
// (which cannot run one) the engine of the linked PC (Settings › Videos through your PC).
const LOCAL='http://127.0.0.1:4567'
export const pcEngine=()=>{try{return localStorage.getItem('pcEngine')||''}catch{return''}}
export const onIos=()=>typeof document!=='undefined'&&document.documentElement.classList.contains('ios')
export const engineBase=()=>onIos()?(pcEngine()||LOCAL):LOCAL
// "192.168.1.5:4580/abcdefghjk" as shown on the PC (spaces, http:// and capitals forgiven).
export function parsePcLink(text:string){
 const m=/^(?:https?:\/\/)?((?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+):(\d{2,5})\/(?:e\/)?([a-z0-9]{10})\/?$/i.exec(String(text||'').trim().replace(/\s+/g,''))
 return m?'http://'+m[1].toLowerCase()+':'+m[2]+'/e/'+m[3].toLowerCase():''}
