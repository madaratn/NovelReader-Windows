// Is a result from another source the same film / series as ours?
// Names differ from one source to another ("The Office (US)", "Office", "Dune: Part
// Two", "Dune 2021", "Frieren: Beyond Journey's End", "Solo Leveling Season 2 VOSTFR"),
// so a name is broken down first:
//  - its words, without accents, articles, release tags (VF, VOSTFR, 1080p…) and year,
//  - the year, the season, and a sequel number ("2", "II", "Part Two"),
//  - what comes after ":" or " - " (a subtitle that some sources add or leave out).
// Two names match when their words are the same (100), or when one only adds a
// subtitle (70). A different year, season or sequel number never matches.
import{mediaNorm}from'./media'

export type TitleInfo={words:string[],main:string[],year?:number,season:number,sequel:number}

const NOISE=new Set(['vf','vff','vfq','vostfr','vosta','vost','vo','multi','french','truefrench','english','dub','dubbed','sub','subbed','subs','dual','audio','hd','fhd','uhd','4k','1080p','720p','480p','2160p','hdr','bluray','webrip','webdl','web','dl','streaming','complete','complet','integrale','uncensored','tv','series','serie','film','movie','anime'])
const ARTICLES=new Set(['the','a','an','le','la','les','l','el','los','las','der','die','das','il','lo','gli'])
const NUMBER_WORDS:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,deux:2,trois:3,quatre:4,cinq:5,un:1,une:1}
const ROMAN:Record<string,number>={ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8}
const SEASON=/^(?:season|saison|temporada|staffel|stagione|s)$/

// A year written in a source's details ("Year: 2021", "Released 2021-03-01", "(2021)").
export function yearOf(...texts:any[]):number|undefined{
 for(const x of texts){
  if(typeof x==='number'&&x>1900&&x<2100)return x
  const s=String(x||'');if(!s)continue
  const m=/\((19\d\d|20\d\d)\)/.exec(s)||/\b(?:year|ann[ée]e|release[ds]?|released|aired|premiered|sortie|date|first air date|start(?:ed)?)\W{0,12}(?:\w+[\s,./-]+){0,4}?(19\d\d|20\d\d)\b/i.exec(s)||(/^\s*(19\d\d|20\d\d)\s*$/.exec(s))
  if(m)return Number(m[1])}
 return undefined}

export function titleInfo(name:string,year?:number):TitleInfo{
 let raw=String(name||'')
 const y=yearOf(raw)??(/[\s(\[]((?:19|20)\d\d)[\s)\]]*$/.exec(raw)?Number(/((?:19|20)\d\d)[\s)\]]*$/.exec(raw)![1]):undefined)
 raw=raw.replace(/[([{]\s*(?:19|20)\d\d\s*[)\]}]/g,' ').replace(/\[[^\]]*\]|\{[^}]*\}/g,' ').replace(/&/g,' and ')
 // What comes after the first ":" / " - " / " – " is a subtitle.
 const cut=/\s*(?::|\s[-–—|]\s)\s*/.exec(raw)
 const head=cut?raw.slice(0,cut.index):raw
 const clean=(s:string)=>mediaNorm(s).split(' ').filter(w=>w&&!NOISE.has(w))
 let words=clean(raw),main=clean(head)
 // The year at the end of a name is not a word of it ("Dune 2021").
 const dropYear=(l:string[])=>l.filter((w,i)=>!(i===l.length-1&&/^(19|20)\d\d$/.test(w)&&l.length>1))
 words=dropYear(words);main=dropYear(main)
 let season=1,sequel=1
 const take=(l:string[])=>{
  const out=[...l]
  for(let i=0;i<out.length;i++){
   const w=out[i],nx=out[i+1]
   // "season 2", "saison 2", "s2", "2nd season"
   if(SEASON.test(w)&&nx&&/^\d{1,2}$/.test(nx)){season=Number(nx);out.splice(i,2);i--;continue}
   const s2=/^s(\d{1,2})$/.exec(w);if(s2){season=Number(s2[1]);out.splice(i,1);i--;continue}
   if(/^\d{1,2}(st|nd|rd|th)$/.test(w)&&nx&&SEASON.test(nx)){season=parseInt(w,10);out.splice(i,2);i--;continue}
   // "part 2", "part two", "chapter 3", "partie 2"
   if(/^(part|partie|chapter|chapitre|vol|volume)$/.test(w)&&nx&&(/^\d{1,2}$/.test(nx)||NUMBER_WORDS[nx]||ROMAN[nx])){sequel=Number(nx)||NUMBER_WORDS[nx]||ROMAN[nx];out.splice(i,2);i--;continue}
  }
  // A number or roman numeral at the end: "Toy Story 3", "Rocky II".
  const last=out[out.length-1]
  if(out.length>1&&last&&(/^\d{1,2}$/.test(last)||ROMAN[last])){sequel=Number(last)||ROMAN[last];out.pop()}
  while(out.length>1&&ARTICLES.has(out[0]))out.shift()
  return out}
 const s0=season,q0=sequel
 main=take(main);const ms=season,mq=sequel;season=s0;sequel=q0
 words=take(words)
 // The season / sequel of the main part counts, unless only the subtitle had one.
 if(ms!==1)season=ms
 if(mq!==1)sequel=mq
 return{words,main,year:year||y,season,sequel}}

const same=(a:string[],b:string[])=>a.length===b.length&&a.every((w,i)=>w===b[i])
const startsWith=(a:string[],b:string[])=>b.length>0&&b.length<a.length&&b.every((w,i)=>a[i]===w)

// 100 = same name, 70 = same name with a subtitle on one side (to be confirmed by the
// year or the episodes: "Star Wars" and "Star Wars: The Clone Wars" look alike), 0 = another title.
export function matchScore(want:TitleInfo,got:TitleInfo):number{
 if(!want.words.length||!got.words.length)return 0
 if(want.season!==got.season||want.sequel!==got.sequel)return 0
 if(want.year&&got.year&&Math.abs(want.year-got.year)>1)return 0
 let score=0
 if(same(want.words,got.words))score=100
 else if(same(want.words,got.main)||same(want.main,got.words))score=70 // one side has a subtitle
 else if(startsWith(got.words,want.words)&&got.main.length===want.words.length)score=70
 if(!score)return 0
 if(want.year&&got.year&&want.year===got.year)score+=5
 // Our year unknown, theirs written in the name: likely a namesake of another year.
 if(!want.year&&got.year)score-=3
 return score}

export const sameTitle=(a:string,b:string,ya?:number,yb?:number)=>matchScore(titleInfo(a,ya),titleInfo(b,yb))
// Words for the search box of another source: the name without year, tags or subtitle noise.
export function searchQuery(name:string){
 const raw=String(name||'').replace(/[([{]\s*(?:19|20)\d\d\s*[)\]}]/g,' ').replace(/\[[^\]]*\]|\{[^}]*\}/g,' ').replace(/\b(?:vostfr|vf|vff|multi|dual audio|1080p|720p|480p|2160p|4k)\b/gi,' ')
 return raw.replace(/\s+/g,' ').trim()}
