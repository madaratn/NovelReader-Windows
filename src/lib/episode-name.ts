// Which season and which episode an entry is, as the sources name them.
//
// Sources do not agree on anything: "S2:E5 - Title", "2x05", "Season 2 Episode 5",
// "Saison 2 Épisode 5", "Staffel 2 Folge 5", "T2 - E5" (Spanish), "2. Sezon 5. Bölüm"
// (Turkish: the number comes first), "Episode 5 Saison 2", a season written as a word
// in Arabic… and the number they send beside the name may be the episode, a count over
// every season, or season and episode packed together ("2.5", "2.0005", "105").
//
// Two readings:
//  - of one name (readName): what the name itself says. The title of an episode is free
//    text ("Episode 12: The Second Season"), so a season is only believed where the name
//    is built ("Season 2 Episode 12"), not in what follows "Episode 12:".
//  - of a whole list (readEpisodes): the same, plus what only the list can tell (a number
//    that is the same for every episode is not a number; a season said in every name is
//    one even where it stands in an odd place). It writes `season` and `number` on each
//    episode, which is what the rest of the app reads.
// No dependency: tested alone (tests/unit/episode-name.test.cjs).

// ---- Text -------------------------------------------------------------------------
// Western digits; Arabic without its marks, with one spelling of alef and ya; no
// invisible direction marks; "第二季" as "第2季".
const CJK:Record<string,number>={'〇':0,'零':0,'一':1,'二':2,'两':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
function cjkNumber(s:string):number|null{
 let total=0,cur=0,seen=false
 for(const ch of s){
  if(ch==='十'){total+=(cur||1)*10;cur=0;seen=true}
  else if(ch==='百'){total+=(cur||1)*100;cur=0;seen=true}
  else if(ch in CJK){cur=CJK[ch];seen=true}
  else return null
 }
 return seen?total+cur:null
}
const toDigit=(d:string)=>{const c=d.charCodeAt(0);return String(c>=0xFF10?c-0xFF10:c>=0x6F0?c-0x6F0:c-0x660)}
// "%D8%A7%D9%84…" as the text it stands for (a few sources send names like that).
export function plainName(v:any):string{
 const s=String(v??'');if(!/%[0-9A-Fa-f]{2}/.test(s))return s
 try{return decodeURIComponent(s)}catch{return s}
}
export function cleanName(v:any):string{
 return plainName(v).normalize('NFC')
  .replace(/[\u0660-\u0669\u06F0-\u06F9\uFF10-\uFF19]/g,toDigit)
  .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,'')
  .replace(/[\u0622\u0623\u0625\u0671]/g,'\u0627').replace(/\u0649/g,'\u064A')
  .replace(/第([〇零一二两兩三四五六七八九十百]+)(?=\s*[季期部集話话回卷])/g,(m,n)=>{const v=cjkNumber(n);return v==null?m:'第'+v})
}

// ---- Words ------------------------------------------------------------------------
const NB='(?<![\\p{L}\\p{N}])',NA='(?![\\p{L}\\p{N}])' // not inside a word or a number
const WE='(?![\\p{L}])' // the end of a word (a number may be glued to it: "Ep5")
const SEASON_WORD='(?:seasons?|saisons?|staffel|stagion[ei]|temporadas?|sezonul|sezon[uy]?|seizoen|sesong|s[äa]song|s[æa]son|kausi|сезон[а-яёіїє]*|[ée]vad|musim|m[ùu]a)'
const EP_WORD='(?:episodes?|épisodes?|episodios?|epis[oó]dios?|episodi|episodul|epizod[aeiy]?|епизод[а-я]*|эпизод[а-я]*|еп[іи]зод[а-яіїє]*|сер[иі][яїию]|выпуск|folge|odcinek|aflevering|avsnitt|afsnit|jakso|cap[ií]tulos?|cap|puntata|b[öo]l[üu]m|r[ée]sz|t[ậa]p|eps?)'
const AR_SEASON='(?:الموسم|موسم|الجزء|جزء)'
const AR_EP='(?:الحلق[ةه]|حلق[ةه]|قسمت)'
// Seasons said as a word. English and the Romance languages (before or after "season").
const ORDINAL:Record<string,number>={first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10,eleventh:11,twelfth:12,
 one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,
 'première':1,premiere:1,'deuxième':2,deuxieme:2,seconde:2,'troisième':3,troisieme:3,'quatrième':4,quatrieme:4,'cinquième':5,cinquieme:5,'sixième':6,sixieme:6,'septième':7,septieme:7,'huitième':8,huitieme:8,'neuvième':9,neuvieme:9,'dixième':10,dixieme:10,
 primera:1,primeira:1,prima:1,segunda:2,seconda:2,tercera:3,terceira:3,terza:3,cuarta:4,quarta:4,quinta:5,sexta:6,sesta:6,'séptima':7,septima:7,'sétima':7,settima:7,octava:8,oitava:8,ottava:8,novena:9,nona:9,'décima':10,decima:10,
 erste:1,zweite:2,dritte:3,vierte:4,'fünfte':5,sechste:6,siebte:7,achte:8,neunte:9,zehnte:10}
const ROMAN:Record<string,number>={I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10}
// Arabic ordinals (after cleanName): "الاول", "الثاني"… and "الثاني عشر" for the teens.
const AR_UNIT:[string,number][]=[['الاول[ي]?',1],['الحادي[ةه]?',1],['الثاني[ةه]?',2],['الثالث[ةه]?',3],['الرابع[ةه]?',4],['الخامس[ةه]?',5],['السادس[ةه]?',6],['السابع[ةه]?',7],['الثامن[ةه]?',8],['التاسع[ةه]?',9],['العاشر[ةه]?',10]]
const AR_ORD='(?:(?:'+AR_UNIT.map(x=>x[0]).join('|')+')(?:\\s+عشر[ةه]?)?|العشرون|العشرين)'
function arabicOrdinal(w:string):number|null{
 if(/^العشر(?:ون|ين)$/.test(w))return 20
 const teen=/\s+عشر[ةه]?$/.test(w),base=w.replace(/\s+عشر[ةه]?$/,'')
 const u=AR_UNIT.find(x=>new RegExp('^'+x[0]+'$').test(base));if(!u)return null
 if(/^الحادي/.test(base))return 11 // only exists in "the eleventh"
 return teen?10+u[1]:u[1]
}
const SEP='\\s*[:#\\-–—.]?\\s*'
const NUM='(\\d{1,4}(?:\\.\\d{1,2})?)'
// The number is said before the word in these languages ("2. Sezon", "2 сезон", "2. évad").
const NUMBER_FIRST=/^(?:sezon|сезон|[ée]vad)/i

// ---- One name ---------------------------------------------------------------------
type Mark={from:number,to:number,n:number}
const blank=(text:string,marks:Mark[])=>{let out=text;for(const m of marks)out=out.slice(0,m.from)+' '.repeat(m.to-m.from)+out.slice(m.to);return out}

// Every place where the text says a season.
function seasonMarks(text:string):Mark[]{
 const out:Mark[]=[];let m:RegExpExecArray|null
 const words=new RegExp(NB+SEASON_WORD+WE,'giu')
 while((m=words.exec(text))){
  const start=m.index,end=start+m[0].length,head=text.slice(0,start),tail=text.slice(end)
  let before:(Mark&{sure?:boolean})|null=null,after:Mark|null=null
  const a=new RegExp('^'+SEP+'(\\d{1,3})(?!\\d)').exec(tail)
  if(a){const to=end+a[0].length
   // "8 Sezon 3 Bölüm": the 3 is the episode's, unless the episode has its own ("Sezon 2 Bölüm 5").
   const taken=new RegExp('^\\s*\\.?\\s*'+EP_WORD+WE+'(?!'+SEP+'\\d)','iu').test(text.slice(to))
   if(!taken)after={n:Number(a[1]),from:start,to}}
  else{
   const w=/^\s*[:\-–—]?\s*([\p{L}]+)(?![\p{L}])/u.exec(tail)
   if(w&&ORDINAL[w[1].toLowerCase()]!=null)after={n:ORDINAL[w[1].toLowerCase()],from:start,to:end+w[0].length}
   else if(w&&ROMAN[w[1]]!=null&&!/^\s*[\p{Ll}]/u.test(tail.slice(w[0].length)))after={n:ROMAN[w[1]],from:start,to:end+w[0].length}}
  const b=/(?<![\p{L}\p{N}.,])(\d{1,3})\s*(\.|º|ª|°|(?:st|nd|rd|th|ère|[eè]me|er|re|e|-?й|-?я|-?го)(?![\p{L}]))?\s*$/iu.exec(head)
  if(b){
   // "Episode 8 Saison 1": the 8 belongs to "Episode".
   const taken=!b[2]&&new RegExp('(?:'+NB+EP_WORD+WE+'\\.?|'+AR_EP+')'+SEP+'$','iu').test(head.slice(0,b.index))
   if(!taken)before={n:Number(b[1]),from:b.index,to:end,sure:!!b[2]}}
  else{const w=/(?<![\p{L}])([\p{L}]+)\s+$/u.exec(head);if(w&&ORDINAL[w[1].toLowerCase()]!=null&&!/^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i.test(w[1]))before={n:ORDINAL[w[1].toLowerCase()],from:w.index,to:end,sure:true}}
  const pick=before&&after?(before.sure||NUMBER_FIRST.test(m[0])?before:after):(before||after)
  if(pick)out.push({from:pick.from,to:pick.to,n:pick.n})
 }
 // Arabic: "الموسم 2", "الموسم الثاني", "الجزء الثامن"
 const ar=new RegExp(AR_SEASON+'\\s*[:\\-–]?\\s*(?:(\\d{1,3})(?!\\d)|('+AR_ORD+')(?![\\p{L}]))','gu')
 while((m=ar.exec(text))){const n=m[1]?Number(m[1]):arabicOrdinal(m[2]);if(n!=null)out.push({from:m.index,to:m.index+m[0].length,n})}
 // Chinese, Japanese, Korean: "第2季", "第2期", "シーズン2", "시즌 2", "2기"
 const cjk=/第\s*(\d{1,3})\s*[季期部]|(?:シーズン|시즌)\s*(\d{1,3})|(?<![\p{N}])(\d{1,2})\s*기(?![\p{L}])/gu
 while((m=cjk.exec(text)))out.push({from:m.index,to:m.index+m[0].length,n:Number(m[1]||m[2]||m[3])})
 return out.sort((x,y)=>x.from-y.from)
}

export type NameRead={
 season:number|null,   // said where the name is built
 loose:number|null,    // said somewhere less sure: in the episode's title, or in a name with no "episode"
 episode:number|null,  // the episode number
 said:boolean,         // the name says which number is the episode's ("Episode 5", "E5", "2x05")
}
const NONE:NameRead={season:null,loose:null,episode:null,said:false}

// Where the free text (the episode's own title) starts after what says the episode:
// "Episode 8: Title", "S1:E8 - Title", "E8 | Title".
const TITLE_SEP=/^(?:\s*[:|]\s*|\s+[-–—]\s*|\s*[-–—]\s+)(?=\S)/u
// What may follow a season said after the episode ("Episode 8 - Saison 2 VF").
const TAIL_NOISE=/^[\s\-–—|:,.]*(?:(?:vf|vostfr|vost|vo|sub|dub|multi|hd|fhd|uhd|4k|\d{3,4}p|مترجم[ةه]?|مدبلج[ةه]?)[\s\-–—|:,.]*|\([^)]*\)[\s\-–—|:,.]*|\[[^\]]*\][\s\-–—|:,.]*)*$/iu

// "Film 1 : Title", "OVA 2", "Special 3": listed beside the seasons, they are season 0.
const SPECIAL=/^\s*(?:film|filme|movie|pel[ií]cula|special|spezial|sp[ée]cial|especial|speciale|ova|oav|ona|sp)\s*#?\s*(\d{1,3})\s*(?:$|[:\-–—|\[(])/iu

export function readName(raw:any):NameRead{
 const text=cleanName(raw);if(!text.trim())return NONE
 let m:RegExpExecArray|null
 if((m=SPECIAL.exec(text)))return{season:0,loose:null,episode:Number(m[1]),said:true}
 // ---- Season and episode in one code ----
 // "S2E5", "S02 E05", "S2:E5", "S2 - E5", "S2 EP5", "S16 - Ep. 360", "S2 Episode 5"
 const codes:(Mark&{episode:number})[]=[]
 const se=new RegExp(NB+'S(\\d{1,3})\\s*[.:\\-_–—]?\\s*E(?:p(?:isode|s)?)?\\.?\\s*'+NUM+'(?![\\p{N}])','giu')
 while((m=se.exec(text)))codes.push({from:m.index,to:m.index+m[0].length,n:Number(m[1]),episode:Number(m[2])})
 // "2x05" (not a picture size: two digits at most before, three after)
 const x=/(?<![\p{L}\p{N}.])(\d{1,2})x(\d{1,3})(?![\p{L}\p{N}])(?=\s*(?:$|[-–—:|.,\[(]))/giu
 while((m=x.exec(text)))codes.push({from:m.index,to:m.index+m[0].length,n:Number(m[1]),episode:Number(m[2])})
 // Spanish and Portuguese: "T2 - E5", "T2E05", "T2 - Episodio 5", "T2 - Cap 5"
 const te=new RegExp(NB+'T(\\d{1,3})\\s*[\\-–.:]?\\s*(?:E|'+EP_WORD+'\\.?)\\s*[:#\\-–]?\\s*'+NUM+'(?![\\p{N}])','giu')
 while((m=te.exec(text)))codes.push({from:m.index,to:m.index+m[0].length,n:Number(m[1]),episode:Number(m[2])})
 codes.sort((a,b)=>a.from-b.from)
 // ---- Seasons said in words ----
 const seasons=seasonMarks(text)
 // "T2 - …" at the very start (Spanish, when the rest is the episode's name)
 if(!codes.length&&(m=/^\s*T(\d{1,3})\s*[\-–]\s/u.exec(text)))seasons.unshift({from:m.index,to:m.index+m[0].length,n:Number(m[1])})
 const rest=blank(text,seasons)
 // ---- What says the episode ----
 const eps:Mark[]=codes.map(c=>({from:c.from,to:c.to,n:c.episode}))
 const words=new RegExp('(?:'+NB+EP_WORD+WE+'\\.?|'+AR_EP+')','giu')
 while((m=words.exec(rest))){
  const start=m.index,end=start+m[0].length,head=rest.slice(0,start),tail=rest.slice(end)
  const a=new RegExp('^'+SEP+NUM+'(?!\\d)').exec(tail)
  const b=/(?<![\p{L}\p{N}.,])(\d{1,4}(?:\.\d{1,2})?)\s*(\.|º|ª)?\s*[:\-–]?\s*$/u.exec(head)
  if(b&&b[2]){eps.push({from:b.index,to:end,n:Number(b[1])});continue} // "5. Bölüm"
  if(a){eps.push({from:start,to:end+a[0].length,n:Number(a[1])});continue}
  // "5 : الحلقة", "8 серия" - but "59 episodes" is a count
  if(b&&!/^(?:episodes|épisodes|episodios|epis[oó]dios|cap[ií]tulos|eps)\.?$/i.test(m[0])){eps.push({from:b.index,to:end,n:Number(b[1])});continue}
  const o=new RegExp('^\\s*('+AR_ORD+')(?![\\p{L}])','u').exec(tail);if(o){const n=arabicOrdinal(o[1]);if(n!=null)eps.push({from:start,to:end+o[0].length,n})}
 }
 // "Season 1 x 8", "Temporada 1 x Episódio 8": the season, then "x" and the episode
 for(const s of seasons)if((m=/^\s*x\s*(?:(?:ep(?:is[oó]dio|isode)?\.?)\s*)?(\d{1,4}(?:\.\d{1,2})?)(?![\d.])/i.exec(rest.slice(s.to))))eps.push({from:s.to,to:s.to+m[0].length,n:Number(m[1])})
 // "E5", "#5", "第5集", "5話", "5화"
 const short=new RegExp(NB+'E'+NUM+NA+'|#\\s*'+NUM+'(?!\\d)|第\\s*(\\d{1,4})\\s*[集話话回]|(?<![\\p{N}])(\\d{1,4})\\s*[集話话화회](?![\\p{L}])','gu')
 while((m=short.exec(rest))){const v=m[1]||m[2]||m[3]||m[4];if(!eps.some(e=>m!.index>=e.from&&m!.index<e.to))eps.push({from:m.index,to:m.index+m[0].length,n:Number(v)})}
 eps.sort((a,b)=>a.from-b.from)
 const first=eps[0]||null
 // ---- Where the episode's own title starts ----
 let cut=Infinity,title=Infinity
 if(first){const sep=TITLE_SEP.exec(text.slice(first.to));if(sep){cut=first.to;title=first.to+sep[0].length}}
 // ---- The season ----
 let season:number|null=null,loose:number|null=null
 const code=codes.find(c=>c.from<cut)
 if(code)season=code.n
 else{
  const built=seasons.find(s=>s.from<cut)
  // After the episode and alone ("Episode 8 - Season 2"): built as well.
  const tail=seasons.find(s=>s.from===title&&TAIL_NOISE.test(text.slice(s.to)))
  if(built)first?season=built.n:loose=built.n
  else if(tail)season=tail.n
  else if(seasons.length)loose=seasons[0].n
  else if(codes.length)loose=codes[0].n
 }
 // "S2" on its own, before a number or the episode ("S2 - 05", "[S2] Episode 5")
 if(season==null&&loose==null&&(m=/(?<![\p{L}\p{N}])S(\d{1,2})(?![\p{L}\p{N}])/u.exec(text))&&m.index<cut){if(first)season=Number(m[1]);else loose=Number(m[1])}
 // ---- The episode ----
 if(first)return{season,loose,episode:first.n,said:true}
 return{season,loose,episode:bareNumber(rest,seasons),said:false}
}

// Nothing says "episode": the number that most likely is one. A name that starts with a
// number ("12 - Title"); the number right after the season ("Saison 4 08"); otherwise the
// last number once years, picture sizes and what stands in brackets are taken away
// ("86 Eighty Six 11 VOSTFR").
function bareNumber(rest:string,seasons:Mark[]):number|null{
 let m:RegExpExecArray|null
 if((m=/^\s*(?:#|n[°º]\s*)?(\d{1,4}(?:\.\d{1,2})?)\s*(?:$|[-–—:|)\]]|\.(?!\d))/iu.exec(rest)))return Number(m[1])
 for(const s of seasons)if((m=/^\s*[:\-–—|,.]?\s*(\d{1,4}(?:\.\d{1,2})?)(?![\p{L}\p{N}])/u.exec(rest.slice(s.to))))return Number(m[1])
 const strip=(t:string)=>t.replace(/\b\d{3,4}\s*[pi]\b|\b[248]k\b|\b[hx]\.?26[45]\b|\b\d{1,2}\s*-?\s*bits?\b|\b[257]\.[01]\b|\b\d+(?:\.\d+)?\s*(?:mb|gb|mo|go|kbps|fps)\b|\bv\d\b/giu,' ')
 const last=(t:string)=>{const all=[...t.matchAll(/(?<![\p{L}\p{N}.,])(\d{1,4}(?:\.\d{1,2})?)(?![\p{L}\p{N}]|,\d)/gu)].map(x=>Number(x[1]));const plain=all.filter(v=>!(Number.isInteger(v)&&v>=1900&&v<=2099));return plain.length?plain[plain.length-1]:all.length?all[all.length-1]:null}
 const open=strip(rest.replace(/\[[^\]]*\]|\([^)]*\)/g,' ')),v=last(open)
 if(v!=null)return v
 const any=last(strip(rest));if(any!=null)return any
 return (m=/\d+(?:\.\d+)?/.exec(rest))?Number(m[0]):null
}

// ---- One episode ------------------------------------------------------------------
const directSeason=(ep:any):number|null=>{const v=ep?.season??ep?.seasonNumber??ep?.season_number;if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null}
// Read with its list already: a season and a number are written on it (the number is
// null when nothing tells it - the episode then goes by its place).
const isRead=(ep:any):boolean=>!!ep&&typeof ep==='object'&&'number' in ep&&directSeason(ep)!=null
// The number the source sends beside the name (0 and -1 are its ways of saying "none").
const fieldOf=(ep:any):number|null=>{const n=Number(isRead(ep)?ep.number??NaN:ep?.number??ep?.episodeNumber??ep?.episode_number);return Number.isFinite(n)&&n>0?n:null}
const nameOf=(ep:any)=>String(ep?.name||ep?.title||'')
const memo=new Map<string,NameRead>()
function readCached(name:string):NameRead{let r=memo.get(name);if(!r){r=readName(name);if(memo.size>20000)memo.clear();memo.set(name,r)}return r}
// The line under the name sometimes is the only place that says the season ("Season 2").
function scanlatorSeason(ep:any):number|null{
 const sc=ep?.scanlator;if(!sc||typeof sc!=='string'||sc.length>40)return null
 const text=cleanName(sc),marks=seasonMarks(text);if(marks.length)return marks[0].n
 const m=/^\s*S(\d{1,2})\s*$/i.exec(text);return m?Number(m[1]):null
}
// "2.5", "2.05", "2.0005" for season 2 episode 5: both packed in the number.
function packedSeason(f:number|null,episode:number|null):number|null{
 if(f==null||episode==null||!Number.isInteger(episode)||episode<1)return null
 const s=Math.floor(f+1e-6),frac=f-s;if(frac<1e-7)return null
 for(const k of[1,2,3,4])if(Math.abs(frac-episode/10**k)<Math.min(5e-5,0.4/10**k))return s
 return null
}
// The season of an episode: 1 when nothing says otherwise, 0 for the specials.
export function seasonNo(ep:any):number{
 const direct=directSeason(ep);if(direct!=null)return direct
 const r=readCached(nameOf(ep));if(r.season!=null)return r.season
 const sc=scanlatorSeason(ep);if(sc!=null)return sc
 const packed=r.said?packedSeason(fieldOf(ep),r.episode):null;if(packed!=null)return packed
 // (A list is read with readEpisodes, which knows better; alone, a season said in a name
 // that has no "episode" is believed.)
 return r.loose!=null&&!r.said?r.loose:1
}
// The number of an episode in its season.
//  - Read with its list (readEpisodes): what was written then.
//  - The name says the season and the episode: that number (the number sent beside such
//    names is often a count over every season, or season and episode packed together).
//  - Otherwise the number sent by the source, then what the name says, then `fallback`.
export function episodeNo(ep:any,fallback:number):number{
 if(isRead(ep)){const n=ep.number==null?NaN:Number(ep.number);return Number.isFinite(n)?n:fallback}
 const f=fieldOf(ep),r=readCached(nameOf(ep))
 if(r.said&&r.episode!=null&&(r.season!=null||f==null||packedSeason(f,r.episode)!=null))return r.episode
 if(f!=null)return f
 return r.episode!=null?r.episode:fallback
}

// ---- How an episode is called ---------------------------------------------------------
// "S2E5", or "E5" for the films and specials and for the seasons that have a name of
// their own ("Saison 1hs", "Kai"): "S3" would say something the source does not.
export const seasonHasName=(ep:any):boolean=>!!(ep?.season_name||ep?.season_films)
export function episodeCode(ep:any,fallback:number):string{
 const s=seasonNo(ep),n=episodeNo(ep,fallback)
 return s>0&&!seasonHasName(ep)?'S'+s+'E'+n:'E'+n
}

// The number an episode has in the lists kept elsewhere (AniList, MyAnimeList): the one the
// source sends when it is a whole number - for a long series it counts on over the seasons.
export function countNo(ep:any):number{const raw=Number(ep?.episode_number??ep?.episodeNumber);return Number.isInteger(raw)&&raw>0?raw:episodeNo(ep,0)}

// ---- Sources that list their seasons one by one -----------------------------------------
// "Naruto Saison 1", "Naruto Saison 1hs", "Naruto Kai", then one entry per film… What a
// source calls a season is not always "season N". Each entry gets a place (a number, by
// which the seasons are ordered and grouped) and, when its name is not simply "Season N",
// that name. Entries whose numbers share their whole part ("3", "3.1", "3.2": the films
// of Anime-Sama) are one group.
export function plainSeasonNumber(label:any):number|null{
 const text=cleanName(label).trim(),marks=seasonMarks(text)
 if(marks.length===1&&marks[0].from===0&&marks[0].to===text.length)return marks[0].n
 const m=/^[ST]\s*(\d{1,3})$/i.exec(text);return m?Number(m[1]):null
}
export type SeasonPlace={season:number,name?:string,films?:boolean,group:boolean,title:string}
export function seasonPlaces(entries:any[],parent?:any):SeasonPlace[]{
 const p=String(parent||'').trim().toLowerCase()
 const rows=entries.map((s,i)=>{
  const title=plainName(s?.title||s?.name||'').trim();let label=title
  // "Naruto Saison 1hs" under "Naruto" is "Saison 1hs"; a film keeps its whole title.
  if(p&&title.toLowerCase().startsWith(p)){const rest=title.slice(p.length).replace(/^[\s:\-–—|,]+/,'').trim();if(rest&&(plainSeasonNumber(rest)!=null||rest.split(/\s+/).length<=3))label=rest}
  const raw=Number(s?.season_number),num=Number.isFinite(raw)&&raw>=0?raw:null
  return{i,title,label,num,plain:plainSeasonNumber(label),url:String(s?.url||s?.path||'')}
 })
 const whole=(n:number)=>Math.floor(n+1e-9)
 const floors=new Map<number,number[]>();for(const r of rows)if(r.num!=null)floors.set(whole(r.num),[...(floors.get(whole(r.num))||[]),r.i])
 const groupOf=(r:typeof rows[number])=>{if(r.num==null)return null;const g=floors.get(whole(r.num))!;return g.length>1&&g.some(i=>!Number.isInteger(rows[i].num))?g:null}
 const idOf=(r:typeof rows[number])=>groupOf(r)?'g'+whole(r.num!):'e'+r.i
 const films=(g:number[])=>g.some(i=>/film|movie|pel[ií]cula/i.test(rows[i].url+' '+rows[i].title))
 // The number the source means: the one its name says ("Saison 3"), or the one it sends.
 const want=rows.map(r=>groupOf(r)?whole(r.num!):(r.plain??r.num))
 const taken=new Map<number,string>();let clash=false
 for(const r of rows){const k=want[r.i];if(k==null){clash=true;break}const id=idOf(r),prev=taken.get(k);if(prev&&prev!==id){clash=true;break}taken.set(k,id)}
 // Two entries for one number, or none at all: the order of the source decides.
 const place=new Map<string,number>();if(clash)for(const r of rows)if(!place.has(idOf(r)))place.set(idOf(r),place.size+1)
 return rows.map(r=>{
  const g=groupOf(r),season=clash?place.get(idOf(r))!:want[r.i]!
  if(g)return{season,group:true,title:r.title,...(films(g)?{films:true}:{name:rows[g[0]].label})}
  return{season,group:false,title:r.title,...(r.plain===season?{}:{name:r.label})}
 })
}

// ---- A whole list -----------------------------------------------------------------
// The seasons read from the names of a list do not hold together: 'one' when everything
// is one list after all, 'films' when each "season" is a film of its own (their numbers
// then mean nothing either).
function notSeasons(rows:{s:number,direct:number|null,r:NameRead,f:number|null}[]):false|'one'|'films'{
 const own=rows.filter(x=>x.direct==null&&x.s!==0);if(own.length<3)return false
 const count=new Map<number,number>();for(const x of own)count.set(x.s,(count.get(x.s)||0)+1)
 if(count.size<2)return false
 const nums=own.map(x=>x.r.said?x.r.episode:x.f).filter(v=>v!=null) as number[]
 // A "season" per entry, all with the same episode number: a list of films.
 if(count.size===own.length&&new Set(nums).size<=1)return'films'
 // The episodes count on from one season to the next (each number comes once), yet in the
 // order of the source the seasons go up and down: some episodes are out of place.
 if(nums.length<own.length*0.8||new Set(nums).size<nums.length*0.9)return false
 const runs:{s:number,n:number}[]=[];for(const x of own){const last=runs[runs.length-1];if(last&&last.s===x.s)last.n++;else runs.push({s:x.s,n:1})}
 // The heaviest run of seasons that only goes up, or only goes down.
 const best=(dir:1|-1)=>{const w=runs.map(r=>r.n);for(let i=0;i<runs.length;i++)for(let j=0;j<i;j++)if((runs[i].s-runs[j].s)*dir>0&&w[j]+runs[i].n>w[i])w[i]=w[j]+runs[i].n;return Math.max(...w)}
 return own.length-Math.max(best(1),best(-1))>Math.max(2,own.length*0.05)?'one':false
}
// Writes `season` and `number` on every episode of a list (once), with what only the
// list can tell. Returns the list itself.
const READ=new WeakSet<object>()
export function readEpisodes<T extends any[]>(list:T):T{
 if(!Array.isArray(list)||!list.length||READ.has(list))return list
 READ.add(list)
 // (An episode is read once, with the first list it comes in: the whole list.)
 const todo=list.filter(ep=>ep&&typeof ep==='object'&&!READ.has(ep)&&!isRead(ep))
 if(!todo.length)return list
 for(const ep of todo)READ.add(ep)
 const rows=todo.map(ep=>{const r=readCached(nameOf(ep)),f=fieldOf(ep);return{ep,r,f,sc:scanlatorSeason(ep),direct:directSeason(ep),packed:r.said?packedSeason(f,r.episode):null,s:1,e:null as number|null}})
 // A season said in a less sure place is believed when most names say one.
 const saying=rows.filter(x=>x.direct!=null||x.r.season!=null||x.sc!=null||x.r.loose!=null).length
 const trustLoose=saying*2>=rows.length
 for(const x of rows)x.s=x.direct??x.r.season??x.sc??x.packed??(trustLoose&&x.r.loose!=null?x.r.loose:1)
 // Some sources put a number after "S" that is no season: a "season" per film, or
 // "seasons" that come and go while the episodes count on (S14 for episodes 898 to 1074,
 // then S16, S31, S29…). Such a list is one list: everything goes back to one season.
 const odd=notSeasons(rows)
 if(odd)for(const x of rows)if(x.direct==null&&x.s!==0)x.s=1
 // The episode: what the name says, or the number sent beside it?
 //  - The name says the season too: the name (beside such names the number sent is often a
 //    count over every season, or the season and the episode packed together).
 //  - Where that is so and the number sent is something else, it is a place in the list,
 //    not an episode number: the names are believed everywhere.
 //  - Otherwise each number should come once in a season: the reading with fewer repeats
 //    wins, and a tie goes to the number sent.
 const named=(x:typeof rows[number])=>x.r.said?x.r.episode:null
 const both=rows.filter(x=>x.r.season!=null&&x.r.said&&x.f!=null&&x.packed==null)
 const fieldIsPlace=both.length>=2&&both.filter(x=>x.f!==x.r.episode).length*2>both.length
 const sent=new Set(rows.map(x=>x.f).filter(v=>v!=null)).size
 const fieldDead=rows.length>2&&sent<=1 // the same number (or none) for every episode
 const plain=rows.filter(x=>x.r.season==null)
 const repeats=(pick:(x:typeof rows[number])=>number|null)=>{const seen=new Set<string>();let n=0;for(const x of plain){const v=pick(x);if(v==null)continue;const k=x.s+':'+v+':'+(x.ep?.scanlator||'');if(seen.has(k))n++;else seen.add(k)}return n}
 const nameWins=repeats(x=>named(x)??x.f)<repeats(x=>x.f??named(x))
 for(const x of rows){
  const n=named(x)
  if(odd==='films'&&x.direct==null){x.e=null;continue}
  if(n!=null&&(x.r.season!=null||x.packed!=null||x.f==null||fieldDead||fieldIsPlace||nameWins))x.e=n
  else if(x.f!=null&&!fieldDead&&!fieldIsPlace)x.e=x.f
  else x.e=n??(fieldIsPlace?null:x.r.episode)
 }
 // Nothing says a number: the order of the source, read from the oldest (sources list
 // the newest first) - unless some episodes do have one, which then come first.
 const known=rows.some(x=>x.e!=null)
 rows.forEach((x,i)=>{if(x.e==null)x.e=known?null:rows.length-i})
 for(const x of rows){x.ep.season=x.s;x.ep.number=x.e}
 return list
}

// Season, then episode number; episodes without a number last, in the source's order.
// The specials (season 0) come after the seasons: nobody starts a series with them.
export const seasonOrder=(a:number,b:number)=>(a===0?Infinity:a)-(b===0?Infinity:b)||0
export function orderedEpisodes(list:any[]=[]){
 readEpisodes(list)
 return list.map((ep,i)=>({ep,s:seasonNo(ep),n:episodeNo(ep,Number.MAX_SAFE_INTEGER),i})).sort((a,b)=>(a.s===b.s?0:seasonOrder(a.s,b.s))||a.n-b.n||a.i-b.i).map(x=>x.ep)
}
