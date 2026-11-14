// The other names of a title, so another source that calls it differently is found
// too ("L'Attaque des Titans" / "Shingeki no Kyojin" / "Attack on Titan"):
//  - anime: AniList (romaji, English, native and the synonyms),
//  - series: TVmaze's names by country (akas),
//  - films (and series TVmaze does not know): Wikidata labels in a few languages.
// Answers are kept 30 days. Every name found is still matched strictly
// (src/lib/title-match.ts): it only widens the search, not what is accepted.
import{titleInfo,matchScore,searchQuery}from'./title-match'
import type{MediaKind}from'./media'

const KEY='altTitles',TTL=30*24*3600e3
const read=():Record<string,{at:number,names:string[]}>=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{return{}}}
const write=(c:any)=>{try{const now=Date.now();for(const k of Object.keys(c))if(now-c[k].at>TTL)delete c[k];localStorage.setItem(KEY,JSON.stringify(c))}catch{}}
const LANGS=['en','fr','es','de','it','pt','ja']
const json=async(url:string,init?:RequestInit)=>{const r=await fetch(url,{...init,headers:{Accept:'application/json',...(init?.headers||{})}});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}

async function anilist(name:string):Promise<string[]>{
 const q='query($s:String){Media(search:$s,type:ANIME,sort:SEARCH_MATCH){title{romaji english native} synonyms}}'
 const j=await json('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:{s:name}})}).catch(()=>null)
 const m=j?.data?.Media;if(!m)return[]
 const all=[m.title?.english,m.title?.romaji,m.title?.native,...(m.synonyms||[])].filter(Boolean).map(String)
 // Only when AniList found this very title under one of its names.
 return all.some(n=>matchScore(titleInfo(name),titleInfo(n))>=70)?all:[]
}
async function tvmaze(name:string):Promise<string[]>{
 const s=await json('https://api.tvmaze.com/singlesearch/shows?q='+encodeURIComponent(name)).catch(()=>null)
 if(!s?.id)return[]
 const akas=await json('https://api.tvmaze.com/shows/'+s.id+'/akas').catch(()=>[])
 const all=[String(s.name||''),...(Array.isArray(akas)?akas.map((a:any)=>String(a?.name||'')):[])].filter(Boolean)
 // Only when one of the show's names is ours (TVmaze also answers with a near miss).
 return all.some(n=>matchScore(titleInfo(name),titleInfo(n))>=70)?all:[]
}
async function wikidata(name:string,kind:MediaKind,year?:number):Promise<string[]>{
 const kindRe=kind==='Movie'?/\b(film|movie|long-métrage)\b/i:/\b(series|série|show|anime|serie)\b/i
 for(const lang of['en','fr']){
  const r=await json('https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&type=item&limit=8&language='+lang+'&uselang='+lang+'&search='+encodeURIComponent(name)).catch(()=>null)
  const hits=(r?.search||[]).filter((h:any)=>kindRe.test(String(h.description||''))&&matchScore(titleInfo(name),titleInfo(String(h.label||h.match?.text||'')))>=70)
  // With a known year, the description must not name another one ("1984 film").
  const pick=hits.find((h:any)=>{const y=Number((/\b(19|20)\d\d\b/.exec(String(h.description||''))||[])[0]);return!year||!y||Math.abs(y-year)<=1})
  if(!pick)continue
  const e=await json('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=labels|aliases&languages='+LANGS.join('|')+'&ids='+encodeURIComponent(pick.id)).catch(()=>null)
  const ent=e?.entities?.[pick.id];if(!ent)return[]
  const names=[...Object.values(ent.labels||{}).map((l:any)=>l?.value),...['en','fr'].flatMap(l=>(ent.aliases?.[l]||[]).map((a:any)=>a?.value))]
  return names.filter(Boolean).map(String)
 }
 return[]
}

// The name first, then up to `max` other names that are really different words.
export async function altTitles(kind:MediaKind,name:string,year?:number,max=4):Promise<string[]>{
 const base=searchQuery(name)||name,key=kind+':'+base.toLowerCase()+':'+(year||''),c=read()
 let names=c[key]&&Date.now()-c[key].at<TTL?c[key].names:null
 if(!names){
  let found:string[]=[]
  try{found=kind==='Anime'?await anilist(base):kind==='Series'?await tvmaze(base):[]
   if(!found.length&&kind!=='Anime')found=await wikidata(base,kind,year)}catch{}
  names=found;c[key]={at:Date.now(),names};write(c)}
 const seen=new Set([titleInfo(base).words.join(' ')]),out=[base]
 for(const n of names){const w=titleInfo(n).words.join(' ');if(!w||seen.has(w))continue
  // A name in another script (Japanese…) has no words to compare: it is left out.
  seen.add(w);out.push(searchQuery(n)||n);if(out.length>max)break}
 return out
}
