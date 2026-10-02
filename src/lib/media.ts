// Shared helpers for Anime / Series / Movies (no React): episode numbering,
// covers, saved playback positions and readable engine errors.
import{lsGet}from'./util'
export function mediaPosKey(mediaKey:string){return 'mediapos:'+mediaKey}
export function readMediaPos(mediaKey:string):{t:number,d:number,done?:boolean,at?:number}|null{try{return JSON.parse(localStorage.getItem(mediaPosKey(mediaKey))||'null')}catch{return null}}
// "Error invoking remote method 'x': Error: Miwayomi HTTP 500 — {"error":"…"}" → "…"
export function cleanEngineError(e:any){let m=String(e?.message||e||'').replace(/^Error invoking remote method '[^']*': (Error: )?/,'').replace(/^Miwayomi HTTP \d+ — /,'');try{const j=JSON.parse(m);if(j&&j.error)m=String(j.error)}catch{}return m}
// ---- Media global search: Books-style progress/grouping without touching Books ----
export type MediaKind='Anime'|'Series'|'Movie'
export function mediaNorm(v:any){return String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
export function mediaCover(a:any){return String(a?.thumbnailUrl||a?.thumbnail_url||a?.thumbnail||a?.coverUrl||a?.cover_url||a?.cover||a?.posterUrl||a?.poster_url||a?.poster||a?.imageUrl||a?.image_url||a?.image||'').trim()}
export async function enrichMediaCover(a:any){if(mediaCover(a))return{...a,thumbnail:mediaCover(a)};const sid=String(a?.sourceId||'');const url=a?.url||a?.path;if(!sid||!url)return a;try{const d=await window.novelReader.miwayomiFetch('/api/v1/anime/'+encodeURIComponent(sid)+'/details?url='+encodeURIComponent(url));return{...a,...d,sourceId:sid,url:a.url||a.path||d?.url,thumbnail:mediaCover(d)||mediaCover(a)}}catch{return a}}

export function episodeNo(ep:any,fallback:number){const n=Number(ep?.number??ep?.episodeNumber??ep?.episode_number);if(Number.isFinite(n))return n;const text=String(ep?.name||ep?.title||'');const m=text.match(/(?:episode|ep\.?|e)\s*(\d+(?:\.\d+)?)/i)||text.match(/(\d+(?:\.\d+)?)/);return m?Number(m[1]):fallback}
export function seasonNo(ep:any){const direct=Number(ep?.season??ep?.seasonNumber??ep?.season_number);if(Number.isFinite(direct))return direct;const text=String(ep?.name||ep?.title||'');const m=text.match(/season\s*(\d+)/i)||text.match(/\bS(\d+)\s*E\d+/i);return m?Number(m[1]):1}
export function orderedEpisodes(list:any[]=[]){return list.map((ep,i)=>({ep,s:seasonNo(ep),n:episodeNo(ep,i+1),i})).sort((a,b)=>a.s-b.s||a.n-b.n||a.i-b.i).map(x=>x.ep)}


// ---- Watch statistics (per day: seconds watched, episodes finished) ----------
export type WatchDay={s:number,e:number}
const dayKeyOf=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
export function readWatchStats():Record<string,WatchDay>{try{return JSON.parse(localStorage.getItem('watchStats')||'{}')||{}}catch{return{}}}
export function bumpWatch(patch:{s?:number,e?:number}){try{const all=readWatchStats(),k=dayKeyOf(),d=all[k]||{s:0,e:0};d.s=Math.round((d.s||0)+(patch.s||0));d.e=(d.e||0)+(patch.e||0);all[k]=d;const keys=Object.keys(all).sort();for(const old of keys.slice(0,Math.max(0,keys.length-400)))delete all[old];localStorage.setItem('watchStats',JSON.stringify(all))}catch{}}
export const watchDayKey=dayKeyOf
/** Number of watched episodes saved for a title (mediapos:<prefix><id>:<episode> with done). */
export function watchedCount(prefix:string,id:string){let n=0;try{const start='mediapos:'+prefix+id+':';for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)!;if(k.startsWith(start)){try{if(JSON.parse(localStorage.getItem(k)||'null')?.done)n++}catch{}}}}catch{}return n}
