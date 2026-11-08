// Chapters saved for offline reading, in the app's IndexedDB (Android). Same
// calls as electron/offline.cjs.
const DB='novelreader-offline',STORE='chapters'
let dbp:Promise<IDBDatabase>|null=null
const db=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore(STORE,{keyPath:'key'});s.createIndex('novel','novelId')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}))
const tx=async<T,>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest|void):Promise<T>=>{const d=await db();return new Promise((res,rej)=>{const t=d.transaction(STORE,mode),s=t.objectStore(STORE);const req=fn(s);t.oncomplete=()=>res((req as IDBRequest|undefined)?.result as T);t.onerror=()=>rej(t.error)})}
const MAX=5*1024*1024
export const offline={
 async save(novelId:string,path:string,html:string,name?:string){const text=String(html||'');if(!novelId||!path)throw Error('Invalid chapter');if(!text.trim())throw Error('Empty chapter');if(text.length>MAX)throw Error('Chapter too large');await tx('readwrite',s=>s.put({key:novelId+'\u0000'+path,novelId,path,html:text,name:name||'',at:Date.now()}));return true},
 async get(novelId:string,path:string){const r:any=await tx('readonly',s=>s.get(novelId+'\u0000'+path));return r?r.html:null},
 async list(novelId:string){const rows:any[]=await tx('readonly',s=>s.index('novel').getAll(novelId));return(rows||[]).map(r=>r.path)},
 async remove(novelId:string){const rows:any[]=await tx('readonly',s=>s.index('novel').getAllKeys(novelId));await tx('readwrite',s=>{for(const k of rows||[])s.delete(k)});return true},
 async usage(){const rows:any[]=await tx('readonly',s=>s.getAll());const novels=new Set((rows||[]).map(r=>r.novelId));return{bytes:(rows||[]).reduce((a,r)=>a+r.html.length*2,0),chapters:(rows||[]).length,novels:novels.size}},
 async clear(){await tx('readwrite',s=>s.clear());return true}
}
