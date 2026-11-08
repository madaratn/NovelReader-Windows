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

// Episode and season numbers, from the source's fields or from the name in many
// languages ("S2 E5", "Episode 5", "Épisode 5", "5. Bölüm", "Sezon 2", "الحلقة ٥"…).
// Sources often send -1 or 0 when they do not know the number: the name is used then.
const digits=(t:string)=>t.replace(/[\u0660-\u0669]/g,d=>String(d.charCodeAt(0)-0x660)).replace(/[\u06F0-\u06F9]/g,d=>String(d.charCodeAt(0)-0x6F0))
const SEASON_RE=[/\bS(\d+)\s*[.:-]?\s*E\d+/i,/(\d+)\s*\.?\s*(?:sezon|season|saison|temporada)\b/i,/(?:season|saison|sezon|temporada|staffel|stagione|الموسم|موسم)\s*[:#-]?\s*(\d+)/i]
const EP_RE=[/\bS\d+\s*[.:-]?\s*E(\d+(?:\.\d+)?)/i,/(?:episode|épisode|episodio|epis[oó]dio|folge|b[öo]l[üu]m|capitulo|cap[ií]tulo|الحلقة|حلقة|\bep\.?|\beps?)\s*[:#-]?\s*(\d+(?:\.\d+)?)/i,/(\d+(?:\.\d+)?)\s*\.?\s*(?:b[öo]l[üu]m|episode|épisode|ep\b|الحلقة)/i,/\bE(\d+(?:\.\d+)?)\b/]
const nameOf=(ep:any)=>digits(String(ep?.name||ep?.title||''))
export function episodeNo(ep:any,fallback:number){const n=Number(ep?.number??ep?.episodeNumber??ep?.episode_number);if(Number.isFinite(n)&&n>0)return n;const text=nameOf(ep);for(const re of EP_RE){const m=text.match(re);if(m)return Number(m[1])}let rest=text;for(const re of SEASON_RE)rest=rest.replace(re,' ');const nums=(rest.match(/\d+(?:\.\d+)?/g)||[]).map(Number),noYears=nums.filter(x=>!(x>=1900&&x<=2099&&Number.isInteger(x)));const pick=noYears.length?noYears[0]:nums[0];return pick!=null?pick:fallback}
export function seasonNo(ep:any){const direct=Number(ep?.season??ep?.seasonNumber??ep?.season_number);if(Number.isFinite(direct)&&direct>0)return direct;const text=nameOf(ep);for(const re of SEASON_RE){const m=text.match(re);if(m)return Number(m[1])}return 1}
// Season, then episode number. Episodes without any number keep the source's order,
// read from the oldest (sources list the newest first).
export function orderedEpisodes(list:any[]=[]){const known=list.some(ep=>{const n=Number(ep?.number??ep?.episodeNumber??ep?.episode_number);return(Number.isFinite(n)&&n>0)||/\d/.test(nameOf(ep))});return list.map((ep,i)=>({ep,s:seasonNo(ep),n:episodeNo(ep,known?Number.MAX_SAFE_INTEGER:list.length-i),i})).sort((a,b)=>a.s-b.s||a.n-b.n||a.i-b.i).map(x=>x.ep)}


// ---- Watch statistics (per day: seconds watched, episodes finished) ----------
export type WatchDay={s:number,e:number}
const dayKeyOf=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
export function readWatchStats():Record<string,WatchDay>{try{return JSON.parse(localStorage.getItem('watchStats')||'{}')||{}}catch{return{}}}
export function bumpWatch(patch:{s?:number,e?:number}){try{const all=readWatchStats(),k=dayKeyOf(),d=all[k]||{s:0,e:0};d.s=Math.round((d.s||0)+(patch.s||0));d.e=(d.e||0)+(patch.e||0);all[k]=d;const keys=Object.keys(all).sort();for(const old of keys.slice(0,Math.max(0,keys.length-400)))delete all[old];localStorage.setItem('watchStats',JSON.stringify(all))}catch{}}
export const watchDayKey=dayKeyOf
/** Number of watched episodes saved for a title (mediapos:<prefix><id>:<episode> with done). */
export function watchedCount(prefix:string,id:string){let n=0;try{const start='mediapos:'+prefix+id+':';for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)!;if(k.startsWith(start)){try{if(JSON.parse(localStorage.getItem(k)||'null')?.done)n++}catch{}}}}catch{}return n}
