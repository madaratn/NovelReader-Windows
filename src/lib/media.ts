// Shared helpers for Anime / Series / Movies (no React): episode numbering,
// covers, saved playback positions and readable engine errors.
import{lsGet}from'./util'
import{engineFetch}from'./engine'
import{readEpisodes,seasonPlaces,orderedEpisodes,episodeNo,countNo}from'./episode-name'
export function mediaPosKey(mediaKey:string){return 'mediapos:'+mediaKey}
export function readMediaPos(mediaKey:string):{t:number,d:number,done?:boolean,at?:number}|null{try{return JSON.parse(localStorage.getItem(mediaPosKey(mediaKey))||'null')}catch{return null}}
// "Error invoking remote method 'x': Error: Miwayomi HTTP 500 — {"error":"…"}" → "…"
export function cleanEngineError(e:any){let m=String(e?.message||e||'').replace(/^Error invoking remote method '[^']*': (Error: )?/,'').replace(/^Miwayomi HTTP \d+ — /,'');try{const j=JSON.parse(m);if(j&&j.error)m=String(j.error)}catch{}return m}
// ---- Media global search: Books-style progress/grouping without touching Books ----
export type MediaKind='Anime'|'Series'|'Movie'
// Any script (Arabic, Cyrillic, CJK…), with loose Arabic spellings (hamza, alef maqsura, ta marbuta).
export function mediaNorm(v:any){return String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ـ/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
export function mediaCover(a:any){return String(a?.thumbnailUrl||a?.thumbnail_url||a?.thumbnail||a?.coverUrl||a?.cover_url||a?.cover||a?.posterUrl||a?.poster_url||a?.poster||a?.imageUrl||a?.image_url||a?.image||'').trim()}
export async function enrichMediaCover(a:any){if(mediaCover(a))return{...a,thumbnail:mediaCover(a)};const sid=String(a?.sourceId||'');const url=a?.url||a?.path;if(!sid||!url)return a;try{const d=await fetchDetails(sid,url,a?.name||a?.title);return{...a,...d,sourceId:sid,url:a.url||a.path||d?.url,thumbnail:mediaCover(d)||mediaCover(a)}}catch{return a}}

// Episode and season numbers: read from what the sources send (src/lib/episode-name.ts).
export{seasonNo,episodeNo,episodeCode,orderedEpisodes,readEpisodes,seasonOrder,seasonHasName,plainName}from'./episode-name'

// Where an episode stands in its list ("is there one after it?"), what the next one is
// called, and its number for the lists kept elsewhere (AniList, MyAnimeList).
export function episodePlace(media:any,ep:any):{pos?:number,next?:number,track:number}{
 const list=orderedEpisodes(media?.episodes||[]),i=list.indexOf(ep)
 return{...(i>=0?{pos:i+1,...(list[i+1]?{next:episodeNo(list[i+1],i+2)}:{})}:{}),track:countNo(ep)}
}

// ---- The episodes of a title ----------------------------------------------------------
// One call for every place that needs them. A source that lists its seasons one by one
// (Anime-Sama…) gives no episode for the title itself: it is then asked for its seasons
// and for the episodes of each, and every episode says which season it is from. The list
// comes back read: `season` and `number` are written on each episode.
const epList=(d:any):any[]=>Array.isArray(d)?d:(d?.episodes||d?.items||d?.list||[])
// (The title goes with the address: some sources read it, and the engine has no other way to know it.)
export const urlArg=(url:any,title?:any)=>'?url='+encodeURIComponent(String(url))+(title?'&title='+encodeURIComponent(String(title).slice(0,200)):'')
export const fetchDetails=(sourceId:any,url:any,title?:any)=>engineFetch('/api/v1/anime/'+encodeURIComponent(String(sourceId))+'/details'+urlArg(url,title))
export type EpisodeOpts={title?:any,onSeasons?:(done:number,total:number)=>void}
const noSeasonList=new Set<string>() // sources that said they have no list of seasons
const seasonLists=new Map<string,{at:number,list:any[]}>() // (a title with 40 seasons is 40 requests: kept a while)
export async function fetchEpisodes(sourceId:any,url:any,opts:EpisodeOpts={}):Promise<any[]>{
 const id=String(sourceId),sid=encodeURIComponent(id),key=id+'\n'+url
 const kept=seasonLists.get(key);if(kept&&Date.now()-kept.at<15*60e3)return kept.list
 let eps:any[]=[],err:any=null
 try{eps=epList(await engineFetch('/api/v1/anime/'+sid+'/episodes'+urlArg(url,opts.title)))}catch(e){err=e}
 if(!eps.length&&!noSeasonList.has(id)){
  const list=await seasonEpisodes(id,String(url),opts).catch(()=>[] as any[])
  if(list.length){readEpisodes(list);seasonLists.set(key,{at:Date.now(),list});if(seasonLists.size>40)seasonLists.delete(seasonLists.keys().next().value as string);return list}
 }
 if(!eps.length&&err)throw err
 return readEpisodes(eps)
}
// How many seasons could not be loaded (a site that answers one request in three…).
export const missingSeasons=(list:any):number=>Number(list?.missingSeasons)||0
async function seasonEpisodes(id:string,url:string,opts:EpisodeOpts):Promise<any[]>{
 const sid=encodeURIComponent(id);let data:any
 try{data=await engineFetch('/api/v1/anime/'+sid+'/seasons'+urlArg(url,opts.title))}
 catch(e:any){if(/UnsupportedOperation|Not used|not supported/i.test(String(e?.message||e)))noSeasonList.add(id);return[]}
 const seasons=(Array.isArray(data)?data:(data?.seasons||data?.items||[])).filter((s:any)=>s&&(s.url||s.path))
 if(!seasons.length)return[]
 const places=seasonPlaces(seasons,opts.title),lists:any[][]=seasons.map(()=>[]),queue=seasons.map((_:any,i:number)=>i)
 let done=0,failed=0;opts.onSeasons?.(0,seasons.length)
 const one=async(i:number)=>{const s=seasons[i];for(let k=0;k<2;k++){try{lists[i]=epList(await engineFetch('/api/v1/anime/'+sid+'/episodes'+urlArg(s.url||s.path,s.title||s.name)));return}catch{if(k)failed++}}}
 await Promise.all(Array.from({length:Math.min(3,seasons.length)},async()=>{while(queue.length){await one(queue.shift()!);done++;opts.onSeasons?.(done,seasons.length)}}))
 const out:any[]=[],count=new Map<number,number>()
 places.forEach((pl,i)=>{
  const mark={season:pl.season,...(pl.films?{season_films:true}:pl.name?{season_name:pl.name}:{})}
  for(const ep of lists[i]){
   // One film per entry: the film is called by the name of its entry, and counted in the group.
   if(pl.group){const n=(count.get(pl.season)||0)+1;count.set(pl.season,n);out.push({...ep,...(lists[i].length===1&&pl.title?{name:pl.title}:{}),...mark,number:n})}
   else out.push({...ep,...mark})
  }
 })
 if(failed)Object.defineProperty(out,'missingSeasons',{value:failed,enumerable:false})
 return out
}


// ---- Watch statistics (per day: seconds watched, episodes finished) ----------
export type WatchDay={s:number,e:number}
const dayKeyOf=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
export function readWatchStats():Record<string,WatchDay>{try{return JSON.parse(localStorage.getItem('watchStats')||'{}')||{}}catch{return{}}}
export function bumpWatch(patch:{s?:number,e?:number}){try{const all=readWatchStats(),k=dayKeyOf(),d=all[k]||{s:0,e:0};d.s=Math.round((d.s||0)+(patch.s||0));d.e=(d.e||0)+(patch.e||0);all[k]=d;const keys=Object.keys(all).sort();for(const old of keys.slice(0,Math.max(0,keys.length-400)))delete all[old];localStorage.setItem('watchStats',JSON.stringify(all))}catch{}}
export const watchDayKey=dayKeyOf
/** Number of watched episodes saved for a title (mediapos:<prefix><id>:<episode> with done). */
export function watchedCount(prefix:string,id:string){let n=0;try{const start='mediapos:'+prefix+id+':';for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)!;if(k.startsWith(start)){try{if(JSON.parse(localStorage.getItem(k)||'null')?.done)n++}catch{}}}}catch{}return n}
