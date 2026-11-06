// Which video sources belong to Anime, Series and Movies, and whether a title
// from a source that has both is a movie or a series.
// Order of decision: the user's choice (Video sources page) > the known list
// below > the source name > all three (unknown sources stay visible everywhere).
export type VideoSection='anime'|'series'|'movies'
export const SECTIONS:VideoSection[]=['anime','series','movies']
const BOTH:VideoSection[]=['series','movies']

// Known sources (name without the "Aniyomi: " prefix, lower case, letters and digits only).
const KNOWN:Record<string,VideoSection[]>={
 // movies and series
 moviesmod:BOTH,uhdmovies:BOTH,castletv:BOTH,'4khdhub':BOTH,fboxtv:BOTH,movies2watch:BOTH,watchroo:BOTH,moviebox:BOTH,netmirror:BOTH,netmovie:BOTH,movix:BOTH,nepu:BOTH,
 cinemacity:BOTH,cinemaos:BOTH,flixer:BOTH,flixhub:BOTH,vegamovies:BOTH,zinkmovies:BOTH,gnula:BOTH,lamovie:BOTH,hexawatch:BOTH,mapple:BOTH,cinejoy:BOTH,
 streamingcommunity:BOTH,streamingunity:BOTH,torrentio:BOTH,torrentiotorrentdebrid:BOTH,empirestreaming:BOTH,wiflix:BOTH,hds:BOTH,movy:BOTH,stremio:BOTH,jellyfin:['anime','series','movies'],
 vidbox:BOTH,bingr:BOTH,moviewala:BOTH,oneshows:BOTH,yomovies:BOTH,pinoymoviepedia:BOTH,dflix:BOTH,dhakaflix2:BOTH,cineplexbd:BOTH,fojik:BOTH,roarzone:BOTH,ftpbd:BOTH,
 // series only (dramas, shows)
 onetouchtv:['series'],dramanice:['series'],myasiantv:['series'],kisskh:['series'],asiaflix:['series'],'1mindrama':['series'],mykdrama:['series'],myrunningman:['series'],
 shuttletv:['series'],kimoitv:['series','anime'],fullraces:['series'],
 // anime (some names do not say it)
 subsplease:['anime'],nyaa:['anime'],torrentioanime:['anime'],torrentioanimetorrentdebrid:['anime'],gogoanime:['anime'],zorotv:['anime'],hianimes:['anime'],lunar:['anime'],'2dhive':['anime'],
 reanime:['anime'],xanime:['anime'],zanix:['anime'],itachi:['anime'],senshi:['anime'],gotaku:['anime'],uniquestream:['anime'],kickassanime:['anime'],'123anime':['anime'],
 vostfree:['anime'],otakufr:['anime'],jetanime:['anime'],voiranime:['anime'],voircartoon:['anime'],frenchanime:['anime'],animesama:['anime'],franime:['anime'],
 luciferdonghua:['anime'],donghuastream:['anime'],chineseanime:['anime'],animexin:['anime'],animeonsen:['anime'],lmanime:['anime'],yfantasy:['anime'],seanime:['anime'],
}
const key=(name:string)=>String(name||'').replace(/^Aniyomi:\s*/i,'').toLowerCase().replace(/[^a-z0-9]/g,'')

const overrides=():Record<string,VideoSection[]>=>{try{return JSON.parse(localStorage.getItem('sourceSections')||'{}')||{}}catch{return{}}}
export function setSourceSections(name:string,sections:VideoSection[]){const o=overrides();if(sections.length)o[key(name)]=sections;else delete o[key(name)];localStorage.setItem('sourceSections',JSON.stringify(o));window.dispatchEvent(new Event('nr-source-sections'))}
export const hasOverride=(name:string)=>!!overrides()[key(name)]

export function sourceSections(name:string):VideoSection[]{
 const k=key(name);const o=overrides()[k];if(o&&o.length)return o
 if(KNOWN[k])return KNOWN[k]
 for(const[kk,v]of Object.entries(KNOWN))if(k.startsWith(kk)&&kk.length>=5)return v
 const n=String(name||'').replace(/^Aniyomi:\s*/i,'')
 if(/anime|^ani|ani$|ani\.me|donghua|hentai|toon|cartoon|animation|otaku|manga|sub\s*dub|vostfr|jav|hanime|^wco|monoschinos|av1encodes/i.test(n))return['anime']
 if(/drama|dorama|novela|asia|kdrama|tv\s*show|series|kissa/i.test(n))return['series']
 if(/movie|film|flix|cine|pel[ií]s|pelicula|cuevana|latino|hackstore|zonaleros|stream|tv\b|hd\b|4k|torrent/i.test(n))return BOTH
 return SECTIONS
}
export const sourceFits=(name:string,section:VideoSection)=>sourceSections(name).includes(section)

// A title from a source that has movies and series: which one is it?
// '' = unknown (kept in both sections).
export function titleKind(a:any):'movie'|'series'|''{
 const url=String(a?.url||a?.path||'').toLowerCase(),title=String(a?.title||a?.name||'').toLowerCase()
 if(/\/(tv|tvshows?|tv-shows?|series|serie|shows?|seasons?|dramas?|web-?series|episodes?)(\/|-|$)/.test(url))return'series'
 if(/\/(movies?|films?|peliculas?|pelicula)(\/|-|$)/.test(url))return'movie'
 if(/\b(season|saison|temporada|staffel)\s*\d|\bs\d{1,2}(e\d{1,3})?\b|\b(complete series|web[- ]?series|tv series|all episodes|episodes? \d)/i.test(title))return'series'
 if(/\b(movie|film)\b/i.test(title)&&!/\bseries\b/i.test(title))return'movie'
 const type=String(a?.type||a?.kind||a?.format||'').toLowerCase()
 if(/movie|film/.test(type))return'movie'
 if(/tv|series|show/.test(type))return'series'
 return''
}
// Should this search / discover result appear in this section?
export function resultFits(a:any,section:VideoSection){
 if(section==='anime')return true
 const k=titleKind(a)
 return section==='movies'?k!=='series':k!=='movie'
}
