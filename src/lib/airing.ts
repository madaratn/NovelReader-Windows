// When the next episodes of the titles in the library come out.
//  - anime: AniList's airing schedule (exact broadcast time in Japan, converted to
//    the device's time zone),
//  - series: TVmaze (the next episode announced by the channel or the platform).
// Titles are looked up by name; the answers are kept for 6 hours.
export type AiringKind='anime'|'series'
export type Airing={kind:AiringKind,itemId:string,title:string,cover:string,episode:number,season?:number,name?:string,at:number}
type Next={episode:number,season?:number,name?:string,at:number}
type Entry={at:number,next:Next[]}

const TTL=6*3600e3,KEY='airingCache'
const lsJson=(k:string)=>{try{return JSON.parse(localStorage.getItem(k)||'{}')||{}}catch{return{}}}
let cache:Record<string,Entry>|null=null
const store=()=>cache||(cache=lsJson(KEY))
const persist=()=>{try{const c=store(),now=Date.now();for(const k of Object.keys(c))if(now-c[k].at>7*24*3600e3)delete c[k];localStorage.setItem(KEY,JSON.stringify(c))}catch{}}
export const clearAiringCache=()=>{cache={};try{localStorage.removeItem(KEY)}catch{}}

// "Frieren (2023)" → "Frieren"; "Solo Leveling - Season 2" stays (AniList knows it).
export function searchName(name:string){return String(name||'').replace(/\s*\((?:19|20)\d\d\)\s*$/,'').replace(/\s*\[[^\]]*\]\s*/g,' ').replace(/\s+/g,' ').trim()}
const itemId=(m:any)=>String(m?.id||m?.url||m?.path||m?.name||'')
const keyOf=(kind:AiringKind,m:any)=>kind+':'+searchName(m?.name||m?.title||'').toLowerCase()

async function anilistBatch(names:string[]):Promise<(Next[]|null)[]>{
 const vars:Record<string,string>={},parts:string[]=[]
 names.forEach((n,i)=>{vars['s'+i]=n;parts.push(`a${i}:Media(search:$s${i},type:ANIME,sort:SEARCH_MATCH){status airingSchedule(notYetAired:true,perPage:6){nodes{airingAt episode}}}`)})
 const query=`query(${names.map((_,i)=>'$s'+i+':String').join(',')}){${parts.join(' ')}}`
 const r=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query,variables:vars})})
 // A title AniList does not know comes back as an error next to the others' data.
 if(!r.ok&&r.status!==404)throw Error('AniList: HTTP '+r.status)
 const j=await r.json().catch(()=>({}))
 return names.map((_,i)=>{const m=j?.data?.['a'+i];if(m===undefined)return null;if(!m)return[];return(m.airingSchedule?.nodes||[]).map((x:any)=>({episode:Number(x.episode)||0,at:Number(x.airingAt)*1000})).filter((x:Next)=>x.at>0)})
}

async function tvmaze(name:string):Promise<Next[]>{
 const r=await fetch('https://api.tvmaze.com/singlesearch/shows?q='+encodeURIComponent(name)+'&embed=nextepisode',{headers:{Accept:'application/json'}})
 if(r.status===404)return[]
 if(!r.ok)throw Error('TVmaze: HTTP '+r.status)
 const s=await r.json(),e=s?._embedded?.nextepisode
 if(!e||!e.airstamp)return[]
 return[{episode:Number(e.number)||0,season:Number(e.season)||undefined,name:String(e.name||''),at:Date.parse(e.airstamp)}].filter(x=>x.at>0)
}

// The next episodes of each title (from the cache when it is recent).
export async function nextEpisodes(kind:AiringKind,items:any[],force=false):Promise<Map<any,Next[]>>{
 const out=new Map<any,Next[]>(),c=store(),now=Date.now(),todo:any[]=[]
 for(const m of items){const k=keyOf(kind,m),hit=c[k];if(!force&&hit&&now-hit.at<TTL)out.set(m,hit.next);else todo.push(m)}
 let failed:any=null
 if(kind==='anime'){
  for(let i=0;i<todo.length;i+=15){const chunk=todo.slice(i,i+15)
   try{const res=await anilistBatch(chunk.map(m=>searchName(m.name||m.title)));chunk.forEach((m,j)=>{const n=res[j];if(n){c[keyOf(kind,m)]={at:now,next:n};out.set(m,n)}})}catch(e){failed=e}}
 }else{
  // A few at a time: TVmaze allows about 20 requests every 10 seconds.
  let next=0
  const worker=async()=>{while(next<todo.length){const m=todo[next++];try{const n=await tvmaze(searchName(m.name||m.title));c[keyOf(kind,m)]={at:now,next:n};out.set(m,n)}catch(e){failed=e}}}
  await Promise.all([worker(),worker(),worker()])
 }
 persist()
 if(failed&&!out.size&&items.length)throw failed
 return out
}

// Everything coming out between 12 hours ago and `days` days from now, soonest first.
export async function upcoming(libs:{anime:any[],series:any[]},days=14,force=false):Promise<Airing[]>{
 const from=Date.now()-12*3600e3,to=Date.now()+days*24*3600e3,list:Airing[]=[]
 const [a,s]=await Promise.allSettled([nextEpisodes('anime',libs.anime,force),nextEpisodes('series',libs.series,force)])
 if(a.status==='rejected'&&s.status==='rejected')throw a.reason
 for(const[kind,res]of[['anime',a],['series',s]]as const){if(res.status!=='fulfilled')continue
  for(const[m,next]of res.value)for(const n of next)if(n.at>=from&&n.at<=to)list.push({kind,itemId:itemId(m),title:String(m.name||m.title||''),cover:String(m.thumbnail||m.thumbnail_url||m.cover||''),...n})}
 return list.sort((x,y)=>x.at-y.at)
}
