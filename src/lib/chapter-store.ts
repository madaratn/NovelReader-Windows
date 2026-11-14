// Chapter lists of the library, kept apart from it (IndexedDB) — speed and safety:
//  - the browser storage of a page holds about 5 MB; a library with long novels
//    (Shadow Slave alone lists 2,500 chapters) used to fill it, and from then on
//    every change of the library was silently lost,
//  - each change (a shelf, new chapters) used to rewrite the whole library with every
//    chapter of every novel, which slowed the app down on big libraries.
// The library in localStorage now keeps each novel without its chapter list
// ("chaptersInStore"), and the lists live in IndexedDB. In the app the novels still
// carry their `chapters` (filled in before the first screen, by hydrateLibrary).
// Nothing is removed from localStorage before its copy in IndexedDB is written.
const DB='nr-chapters',STORE='lists'
const cache=new Map<string,any[]>()     // novel id -> chapter list (what the app uses)
const stored=new Set<string>()          // lists confirmed in IndexedDB, as they are in the cache
let dbp:Promise<IDBDatabase>|null=null
const db=()=>dbp||(dbp=new Promise((res,rej)=>{try{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}}))
const idOf=(n:any)=>String(n?.id??'')

function light(list:any[]){
 return list.map(n=>{const id=idOf(n);if(!Array.isArray(n?.chapters)||!stored.has(id)||cache.get(id)!==n.chapters)return n
  const{chapters,...rest}=n;return{...rest,chapterCount:chapters.length,chaptersInStore:1}})
}
// The novels with their chapter lists (from the cache when the saved copy has none).
export function withChapters(list:any[]){
 return(Array.isArray(list)?list:[]).map(n=>{if(!n||Array.isArray(n.chapters))return n;const c=cache.get(idOf(n));const{chaptersInStore,...rest}=n;return{...rest,chapters:c||[]}})
}

let pending:any[]|null=null,timer:any=null
async function flush(){
 timer=null;const list=pending;if(!list)return
 const todo=list.filter(n=>Array.isArray(n?.chapters)&&!stored.has(idOf(n)))
 if(todo.length){
  try{const d=await db();await new Promise<void>((res,rej)=>{const tx=d.transaction(STORE,'readwrite'),st=tx.objectStore(STORE);for(const n of todo)st.put(n.chapters,idOf(n));tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})
   for(const n of todo)if(cache.get(idOf(n))===n.chapters)stored.add(idOf(n))}
  catch{return} // no IndexedDB: the chapters stay in localStorage, as before
 }
 if(pending===list){pending=null;write(list)}
}
function write(list:any[]){try{localStorage.setItem('library',JSON.stringify(light(list)))}catch(e){console.warn('[library] could not be saved',e)}}

// Saves the library (the app's list, chapters included).
export function saveLibrary(list:any[]){
 for(const n of list){const id=idOf(n);if(!Array.isArray(n?.chapters))continue;if(cache.get(id)!==n.chapters){cache.set(id,n.chapters);stored.delete(id)}}
 write(list)                      // new or changed lists stay inline until IndexedDB has them
 if(list.some(n=>Array.isArray(n?.chapters)&&!stored.has(idOf(n)))){pending=list;clearTimeout(timer);timer=setTimeout(flush,50)}
}
// The saved library, read as the app needs it (synchronous: chapters from the cache).
export function loadLibrary():any[]{try{return withChapters(JSON.parse(localStorage.getItem('library')||'[]'))}catch{return[]}}
// Before the first screen: the chapter lists of the saved library, from IndexedDB; old
// libraries (chapters inline) move their lists there.
export async function hydrateLibrary(){
 let list:any[]=[];try{list=JSON.parse(localStorage.getItem('library')||'[]')}catch{}
 if(!Array.isArray(list)||!list.length)return
 const want=list.filter(n=>n&&n.chaptersInStore&&!Array.isArray(n.chapters)).map(idOf)
 if(want.length){try{const d=await db();await new Promise<void>((res,rej)=>{const tx=d.transaction(STORE,'readonly'),st=tx.objectStore(STORE);for(const id of want){const r=st.get(id);r.onsuccess=()=>{if(Array.isArray(r.result)){cache.set(id,r.result);stored.add(id)}}}tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}catch{}}
 // Inline lists (old format, or from a sync / a restore): moved to IndexedDB.
 if(list.some(n=>Array.isArray(n?.chapters)))saveLibrary(withChapters(list))
}
// A library written by the sync or a backup restore (chapters inline or not).
export function writeLibraryJson(json:string){let list:any[]=[];try{list=JSON.parse(json||'[]')}catch{return};saveLibrary(withChapters(list))}
// The whole library as text, chapters included (backups, sync with the other devices).
export function fullLibraryJson(){return JSON.stringify(loadLibrary())}
export const _test={cache,stored,flush:()=>flush()}
