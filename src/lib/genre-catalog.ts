// Browsing by genre (Discover › Genres) for videos. The video sources cannot be
// asked for a genre, so the lists come from public catalogues, and a title is then
// looked for on your sources:
//  - anime: AniList (popular titles of a genre),
//  - series and movies: Cinemeta, Stremio's public catalogue (IMDb data).
export type CatalogKind='Anime'|'Series'|'Movie'
export type CatalogTitle={id:string,title:string,alt:string[],year?:number,cover:string,score?:number,genres:string[]}

export const ANIME_GENRES=['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mahou Shoujo','Mecha','Music','Mystery','Psychological','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller']
const COMMON=['Action','Adventure','Animation','Biography','Comedy','Crime','Documentary','Drama','Family','Fantasy','History','Horror','Mystery','Romance','Sci-Fi','Sport','Thriller','War','Western']
export const MOVIE_GENRES=COMMON
export const SERIES_GENRES=[...COMMON,'Reality-TV','Talk-Show','Game-Show']
export const genresFor=(k:CatalogKind)=>k==='Anime'?ANIME_GENRES:k==='Series'?SERIES_GENRES:MOVIE_GENRES

const PER_PAGE=30
const cache=new Map<string,CatalogTitle[]>()

async function anilist(genre:string,page:number):Promise<CatalogTitle[]>{
 const query=`query($g:String,$p:Int){Page(page:$p,perPage:${PER_PAGE}){media(type:ANIME,genre:$g,sort:POPULARITY_DESC,isAdult:false){id title{romaji english native} synonyms seasonYear coverImage{large} averageScore genres}}}`
 const r=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query,variables:{g:genre,p:page}})})
 if(!r.ok)throw Error('AniList: HTTP '+r.status)
 const j=await r.json(),list=j?.data?.Page?.media||[]
 return list.map((m:any)=>({id:'al:'+m.id,title:m.title?.english||m.title?.romaji||'',alt:[m.title?.romaji,m.title?.english,...(m.synonyms||[])].filter(Boolean),year:m.seasonYear||undefined,cover:m.coverImage?.large||'',score:m.averageScore?m.averageScore/10:undefined,genres:m.genres||[]})).filter((x:CatalogTitle)=>x.title)}

async function cinemeta(kind:'movie'|'series',genre:string,page:number):Promise<CatalogTitle[]>{
 // Cinemeta pages hold 100 titles: page n of 30 is a slice of the matching one.
 const skip=Math.floor((page-1)*PER_PAGE/100)*100,url=`https://v3-cinemeta.strem.io/catalog/${kind}/top/genre=${encodeURIComponent(genre)}${skip?'&skip='+skip:''}.json`
 let all=cache.get(url)
 if(!all){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw Error('Cinemeta: HTTP '+r.status);const j=await r.json()
  all=(j?.metas||[]).map((m:any)=>({id:String(m.imdb_id||m.id||''),title:String(m.name||''),alt:[],year:parseInt(String(m.releaseInfo||m.year||''),10)||undefined,cover:String(m.poster||''),score:Number(m.imdbRating)||undefined,genres:Array.isArray(m.genres)?m.genres:(Array.isArray(m.genre)?m.genre:[])})).filter((x:CatalogTitle)=>x.title)
  cache.set(url,all!)}
 const from=((page-1)*PER_PAGE)%100
 return all!.slice(from,from+PER_PAGE)}

export async function catalogByGenre(kind:CatalogKind,genre:string,page=1):Promise<CatalogTitle[]>{
 const key=kind+'|'+genre+'|'+page;const hit=cache.get(key);if(hit)return hit
 const list=kind==='Anime'?await anilist(genre,page):await cinemeta(kind==='Series'?'series':'movie',genre,page)
 cache.set(key,list);return list}
