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
