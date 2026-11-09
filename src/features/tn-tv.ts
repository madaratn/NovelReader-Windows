// "Tunisian TV": the series and telefilms that Tunisian channels publish on their
// official YouTube channels, as a video source of the app (served here, not by the
// engine: see src/lib/engine.ts). Series = the channels' playlists, episodes = the
// videos; they play in YouTube's own player (embedded). Needs a free YouTube Data API
// key (Sources page). Calls: playlists 1 unit each, a channel lookup 100 units once.
export const TNTV_ID='777000000000000216'
export const TNTV_NAME='Tunisian TV (YouTube)'
import{t}from'../i18n'
const API='https://www.googleapis.com/youtube/v3/'
// Official channels of Tunisian broadcasters (looked up by name once, then kept).
export const TNTV_CHANNELS=['Télévision Tunisienne','Elhiwar Ettounsi','Attessia TV','Carthage Plus TV','Nessma TV','Tunisna TV']
const PAGE=30

const ls={get:(k:string)=>{try{return localStorage.getItem(k)}catch{return null}},set:(k:string,v:string)=>{try{localStorage.setItem(k,v)}catch{}}}
export const tntvKey=()=>String(ls.get('ytApiKey')||'').trim()
export const tntvEnabled=()=>ls.get('tntvEnabled')==='1'&&!!tntvKey()
export function setTntv(key:string,on:boolean){ls.set('ytApiKey',key.trim());ls.set('tntvEnabled',on?'1':'0')
 // Arabic among the chosen languages, where a choice was saved (otherwise the source would stay hidden).
 if(on)for(const k of ['mediaLangs:Series','mediaLangs:Movie','videoCatalogLangs']){try{const v=JSON.parse(ls.get(k)||'null');if(Array.isArray(v)&&!v.includes('ar'))ls.set(k,JSON.stringify([...v,'ar']))}catch{}}
 try{localStorage.removeItem('tntvPlaylists')}catch{}window.dispatchEvent(new Event('nr-sources-changed'))}

async function yt(path:string,params:Record<string,string>){
 const key=tntvKey();if(!key)throw Error(t('Add your free YouTube key in Sources › Tunisian TV.'))
 const q=new URLSearchParams({...params,key})
 const r=await fetch(API+path+'?'+q.toString())
 const d=await r.json().catch(()=>({}))
 if(!r.ok){const reason=d?.error?.errors?.[0]?.reason||'';throw Error(reason==='quotaExceeded'?t('YouTube daily quota used up: try again tomorrow.'):/keyInvalid|badRequest|API_KEY/i.test(reason+JSON.stringify(d?.error||''))?t('The YouTube key is not valid.'):'YouTube HTTP '+r.status+(d?.error?.message?' — '+d.error.message:''))}
 return d
}

type Channel={name:string,id:string,title:string}
async function channels():Promise<Channel[]>{
 let cache:Record<string,Channel>={};try{cache=JSON.parse(ls.get('tntvChannels')||'{}')||{}}catch{}
 const out:Channel[]=[]
 for(const name of TNTV_CHANNELS){
  if(!cache[name]){try{const d=await yt('search',{part:'snippet',type:'channel',q:name,maxResults:'1',regionCode:'TN'});const it=d.items?.[0];if(it)cache[name]={name,id:it.snippet?.channelId||it.id?.channelId,title:it.snippet?.channelTitle||it.snippet?.title||name}}catch(e){if(!out.length&&name===TNTV_CHANNELS[0])throw e}}
  if(cache[name]?.id)out.push(cache[name])
 }
 ls.set('tntvChannels',JSON.stringify(cache))
 return out
}

export type Playlist={id:string,title:string,thumb:string,channel:string,count:number,at:string}
async function playlists():Promise<Playlist[]>{
 try{const c=JSON.parse(ls.get('tntvPlaylists')||'null');if(c&&Date.now()-c.at<12*3600_000&&c.list?.length)return c.list}catch{}
 const all:Playlist[]=[]
 for(const ch of await channels()){
  let token='';for(let i=0;i<10;i++){
   const d=await yt('playlists',{part:'snippet,contentDetails',channelId:ch.id,maxResults:'50',...(token?{pageToken:token}:{})})
   for(const p of d.items||[]){const n=Number(p.contentDetails?.itemCount)||0;if(n<1)continue;all.push({id:p.id,title:String(p.snippet?.title||''),thumb:p.snippet?.thumbnails?.high?.url||p.snippet?.thumbnails?.medium?.url||'',channel:ch.title,count:n,at:String(p.snippet?.publishedAt||'')})}
   token=d.nextPageToken||'';if(!token)break}
 }
 ls.set('tntvPlaylists',JSON.stringify({at:Date.now(),list:all}))
 return all
}

// Arabic and Latin spellings compared loosely (diacritics, alef / ya / ta marbuta forms).
export const norm=(s:string)=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ـ/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
export function matches(title:string,query:string){const t=norm(title),words=norm(query).split(' ').filter(Boolean);return words.length>0&&words.every(w=>t.includes(w))}

const page=(list:Playlist[],p:number)=>({animes:list.slice((p-1)*PAGE,p*PAGE).map(x=>({url:'pl:'+x.id,title:x.title,thumbnail_url:x.thumb,description:x.channel+' · '+x.count+' videos'})),hasNextPage:list.length>p*PAGE})
export const episodeNumber=(title:string,i:number)=>{const m=/(?:الحلقة|حلقة|episode|ép(?:isode)?|ep\.?)\s*(\d{1,4})/i.exec(title)||/(?:^|\D)(\d{1,3})\s*$/.exec(title.trim());return m?Number(m[1]):i+1}

/** Answers the engine's API paths for this source. */
export async function tntvFetch(path:string):Promise<any>{
 const u=new URL('http://x'+path),kind=u.pathname.split('/').pop()||'',p=Math.max(1,Number(u.searchParams.get('page'))||1),url=u.searchParams.get('url')||''
 if(kind==='popular')return page((await playlists()).slice().sort((a,b)=>b.count-a.count),p)
 if(kind==='latest')return page((await playlists()).slice().sort((a,b)=>b.at.localeCompare(a.at)),p)
 if(kind==='search'){const q=u.searchParams.get('query')||u.searchParams.get('q')||'';return page((await playlists()).filter(x=>matches(x.title,q)),p)}
 if(kind==='details'){const id=url.replace(/^pl:/,'');const d=await yt('playlists',{part:'snippet,contentDetails',id});const s=d.items?.[0]?.snippet||{};return{url,title:s.title||'',description:s.description||'',thumbnail_url:s.thumbnails?.high?.url||s.thumbnails?.medium?.url||'',author:s.channelTitle||'',genre:'Tunisie',status:0}}
 if(kind==='episodes'){
  const id=url.replace(/^pl:/,''),eps:any[]=[];let token=''
  for(let i=0;i<20;i++){const d=await yt('playlistItems',{part:'snippet,contentDetails',playlistId:id,maxResults:'50',...(token?{pageToken:token}:{})});for(const it of d.items||[]){const vid=it.contentDetails?.videoId,title=String(it.snippet?.title||'');if(!vid||/^(private|deleted) video$/i.test(title))continue;eps.push({url:'yt:'+vid,name:title,date_upload:Date.parse(it.contentDetails?.videoPublishedAt||it.snippet?.publishedAt||'')||0})}token=d.nextPageToken||'';if(!token)break}
  return{episodes:eps.map((e,i)=>({...e,episode_number:episodeNumber(e.name,i)}))}
 }
 if(kind==='videos'){const id=url.replace(/^yt:/,'');return{videos:[{videoUrl:'https://www.youtube.com/watch?v='+id,videoTitle:'YouTube',headers:{},subtitleTracks:[],audioTracks:[]}]}}
 if(kind==='hosters')return{hosters:[]}
 if(kind==='seasons')return[]
 throw Error('Not supported by '+TNTV_NAME)
}
