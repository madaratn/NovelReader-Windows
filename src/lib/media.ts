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

