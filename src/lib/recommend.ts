// "Because you liked…" (Discover › For you): suggestions from the titles of the
// library you finished (shelf "Completed") or watched most recently.
//  - anime: AniList's recommendations of that title (what its users suggest),
//  - series and films: titles of the same genres among the most watched on IMDb
//    (Cinemeta), the ones sharing the most genres first.
// Titles already in the library are left out.
import{catalogByGenre,type CatalogKind,type CatalogTitle}from'./genre-catalog'
import{sameTitle,searchQuery,yearOf}from'./title-match'
import{mediaNorm}from'./media'

export type ForYou={because:string,items:CatalogTitle[]}
const cache=new Map<string,ForYou[]>()

// The titles to start from: finished first, then the most recently watched.
export function seedsOf(library:any[],max=5){
 const at=(m:any)=>{const id=String(m?.id||m?.url||m?.name||'');try{return Number(JSON.parse(localStorage.getItem('lastEpInfo:'+id)||'null')?.at)||0}catch{return 0}}
 const live=library.filter(m=>m&&(m.name||m.title)&&m.shelf!=='dropped')
 const done=live.filter(m=>m.shelf==='completed').sort((a,b)=>(Number(b.shelfAt)||0)-(Number(a.shelfAt)||0))
 const recent=live.filter(m=>!done.includes(m)&&at(m)>0).sort((a,b)=>at(b)-at(a))
 return[...done,...recent].slice(0,max)
}

async function anime(names:string[]):Promise<ForYou[]>{
 const vars:Record<string,string>={},parts:string[]=[]
 names.forEach((n,i)=>{vars['s'+i]=n;parts.push(`a${i}:Media(search:$s${i},type:ANIME,sort:SEARCH_MATCH){title{romaji english} recommendations(sort:RATING_DESC,perPage:12){nodes{rating mediaRecommendation{id title{romaji english} synonyms seasonYear coverImage{large} averageScore genres isAdult}}}}`)})
 const query=`query(${names.map((_,i)=>'$s'+i+':String').join(',')}){${parts.join(' ')}}`
 const r=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query,variables:vars})})
 if(!r.ok&&r.status!==404)throw Error('AniList: HTTP '+r.status)
 const j=await r.json().catch(()=>({}))
 return names.map((n,i)=>{const m=j?.data?.['a'+i];if(!m)return{because:n,items:[]}
  // Only when AniList found this very title.
  if(![m.title?.english,m.title?.romaji].some((x:any)=>x&&sameTitle(n,x)>=70))return{because:n,items:[]}
  const items=(m.recommendations?.nodes||[]).filter((x:any)=>x?.mediaRecommendation&&!x.mediaRecommendation.isAdult&&(x.rating||0)>0).map((x:any)=>{const r=x.mediaRecommendation;return{id:'al:'+r.id,title:r.title?.english||r.title?.romaji||'',alt:[r.title?.romaji,r.title?.english,...(r.synonyms||[])].filter(Boolean),year:r.seasonYear||undefined,cover:r.coverImage?.large||'',score:r.averageScore?r.averageScore/10:undefined,genres:r.genres||[]}}).filter((x:CatalogTitle)=>x.title)
  return{because:n,items}})
}

async function imdb(kind:'Series'|'Movie',name:string):Promise<ForYou>{
 const type=kind==='Series'?'series':'movie'
 const r=await fetch(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(searchQuery(name)||name)}.json`,{headers:{Accept:'application/json'}})
 if(!r.ok)throw Error('Cinemeta: HTTP '+r.status)
 const j=await r.json(),year=yearOf(name)
 const seed=(j?.metas||[]).find((m:any)=>sameTitle(name,String(m.name||''),year,parseInt(String(m.releaseInfo||''),10)||undefined)>=70)
 const genres:string[]=Array.isArray(seed?.genres)?seed.genres:Array.isArray(seed?.genre)?seed.genre:[]
 if(!genres.length)return{because:name,items:[]}
 // The two first genres of the title; the titles sharing the most of its genres first.
 const lists=await Promise.all(genres.slice(0,2).map(g=>catalogByGenre(kind,g,1).catch(()=>[] as CatalogTitle[])))
 const byId=new Map<string,CatalogTitle>();for(const l of lists)for(const x of l)if(!byId.has(x.id))byId.set(x.id,x)
 const shared=(x:CatalogTitle)=>x.genres.filter(g=>genres.includes(g)).length
 const items=[...byId.values()].filter(x=>x.id!==seed.imdb_id&&x.id!==seed.id&&sameTitle(name,x.title)===0).sort((a,b)=>shared(b)-shared(a)||(b.score||0)-(a.score||0)).slice(0,12)
 return{because:name,items}
}

export async function forYou(kind:CatalogKind,library:any[]):Promise<ForYou[]>{
 const seeds=seedsOf(library).map(m=>String(m.name||m.title))
 if(!seeds.length)return[]
 const key=kind+'|'+seeds.join('|');const hit=cache.get(key);if(hit)return hit
 const groups=kind==='Anime'?await anime(seeds):await Promise.all(seeds.map(n=>imdb(kind,n).catch(()=>({because:n,items:[]}))))
 // Not what is already in the library, and each suggestion once.
 const have=new Set(library.map(m=>mediaNorm(m.name||m.title||'')).filter(Boolean)),seen=new Set<string>()
 const out=groups.map(g=>({because:g.because,items:g.items.filter(x=>{const names=[x.title,...x.alt].map(mediaNorm);if(names.some(n=>have.has(n))||seen.has(x.id))return false;seen.add(x.id);return true}).slice(0,10)})).filter(g=>g.items.length)
 cache.set(key,out);return out
}
