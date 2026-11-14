// Kids profile: what a child may open, and the parent code.
//  - The parent code (4 to 8 digits) is kept as a salted SHA-256, never in clear.
//  - In a kids profile, a title is refused when its genres are known and one of them
//    is for adults (or, when the parent chose genres, none of them is allowed).
//    A title whose genres the source does not give is not refused.
export const KIDS_GENRES=['Animation','Family','Kids','Comedy','Adventure','Fantasy','Sports','Slice of Life','Music','Mystery','Sci-Fi']
const BLOCKED=/\b(hentai|ecchi|erotica|erotic|adult|smut|mature|18\+|yaoi|yuri|shounen[- ]ai|shoujo[- ]ai|boys'? love|girls'? love|gore|horror|harem)\b/i
// Different names for the same genre on different sources and catalogs.
const SAME:Record<string,RegExp>={
 'Animation':/animation|anim[ée]|cartoon/i,'Family':/family|famille/i,'Kids':/kids?|children|enfants?|jeunesse/i,'Comedy':/comedy|com[ée]die|humou?r/i,
 'Adventure':/adventure|aventure/i,'Fantasy':/fantasy|fantastique|fantasie/i,'Sports':/sports?/i,'Slice of Life':/slice of life|tranche de vie/i,
 'Music':/music|musique|musical/i,'Mystery':/mystery|myst[èe]re/i,'Sci-Fi':/sci-?fi|science[- ]fiction/i}

export function kidsVerdict(genres:any,allowed:string[]|undefined):{ok:boolean,reason?:'adult'|'genre'}{
 const list=(Array.isArray(genres)?genres:String(genres||'').split(/[,;|]/)).map((g:any)=>String(g||'').trim()).filter(Boolean)
 if(!list.length)return{ok:true}
 if(list.some(g=>BLOCKED.test(g)))return{ok:false,reason:'adult'}
 const want=(allowed||[]).filter(g=>SAME[g])
 if(want.length&&!list.some(g=>want.some(w=>SAME[w].test(g))))return{ok:false,reason:'genre'}
 return{ok:true}
}
export const genreAllowed=(genre:string,allowed:string[]|undefined)=>!BLOCKED.test(genre)&&(!(allowed||[]).length||(allowed||[]).some(w=>SAME[w]?.test(genre)))

export const validPin=(pin:string)=>/^\d{4,8}$/.test(String(pin||''))
export async function hashPin(pin:string,salt:string){
 const data=new TextEncoder().encode(salt+':'+pin)
 const d=await crypto.subtle.digest('SHA-256',data)
 return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')
}
export const newSalt=()=>[...crypto.getRandomValues(new Uint8Array(12))].map(b=>b.toString(16).padStart(2,'0')).join('')

// Five wrong codes in a row: wait 30 seconds.
export function makeThrottle(){let fails=0,until=0;return{
 check:()=>{if(Date.now()<until)throw Error('Too many wrong codes. Try again in 30 seconds.')},
 result:(ok:boolean)=>{if(ok){fails=0;return}fails++;if(fails>=5){fails=0;until=Date.now()+30000}}}}
