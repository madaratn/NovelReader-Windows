// Profiles on the phone: several people on one device, each with their own
// libraries, progress, history and settings — like on the PC, where each profile
// has its own browser storage. The WebView has a single storage, so the profile in
// use lives in localStorage as usual and the others wait in IndexedDB; switching
// puts the current one away, brings the other back and reloads the app.
// Shared by all profiles (as on the PC): installed sources, site checks, source
// health, downloads settings and other device settings, offline chapters.
const META='nrProfiles'
const DB='nr-profiles',STORE='data'
const SHARED=/^(nrProfiles$|plugin:|siteChecks$|installedSources$|enabledPlugins$|animeRepos$|animeRepoUrl$|sourceHealth|videoSourceHealth|sourceScan|deadSources$|deadKeep$|pcEngine$|lastUpdateCheck$|autoCheckUpdates$|extAutoUpdate$|debugStreamProbe$|onboarded$|whatsNewSeen$|dl[A-Z]|CapacitorStorage|_cap)/
const COLORS=['#8b7cff','#3fb37f','#e08a2e','#d9545f','#2b9bd8','#c06bd8','#c9a43a']
type State={list:Profile[],current:string}

export const sharedKey=(k:string)=>SHARED.test(k)
const clean=(s:any)=>String(s||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,40)
function load():State{
 let s:any=null;try{s=JSON.parse(localStorage.getItem(META)||'null')}catch{}
 if(!s||!Array.isArray(s.list)||!s.list.length)s={list:[{id:'default',name:'',color:COLORS[0]}],current:'default'}
 if(!s.list.some((p:Profile)=>p.id===s.current))s.current=s.list[0].id
 return s
}
const save=(s:State)=>localStorage.setItem(META,JSON.stringify(s))

let dbp:Promise<IDBDatabase>|null=null
const db=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}))
const tx=async<T>(mode:IDBTransactionMode,f:(s:IDBObjectStore)=>IDBRequest<T>)=>{const d=await db();return new Promise<T>((res,rej)=>{const t=d.transaction(STORE,mode),r=f(t.objectStore(STORE));t.oncomplete=()=>res(r.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}

// The current profile's own entries.
export function ownEntries(){const out:Record<string,string>={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)!;if(!sharedKey(k))out[k]=localStorage.getItem(k)||''}return out}

export const androidProfiles={
 profileList:async()=>{const s=load();return{list:s.list.map(p=>({...p,current:p.id===s.current})),current:s.current}},
 profileCreate:async(name:string)=>{const s=load(),id=Math.random().toString(16).slice(2,12);const p={id,name:clean(name)||'Profile '+(s.list.length+1),color:COLORS[s.list.length%COLORS.length]};s.list.push(p);save(s);return p},
 profileRename:async(id:string,name:string)=>{const s=load(),p=s.list.find(x=>x.id===id);if(!p)throw Error('Unknown profile');p.name=clean(name);save(s);return p},
 profileColor:async(id:string,color:string)=>{const s=load(),p=s.list.find(x=>x.id===id);if(p&&/^#[0-9a-f]{6}$/i.test(color)){p.color=color;save(s)}return p as Profile},
 profileRemove:async(id:string)=>{const s=load();if(id==='default')throw Error('The first profile cannot be removed');if(id===s.current)throw Error('Switch to another profile first');s.list=s.list.filter(x=>x.id!==id);save(s);await tx('readwrite',st=>st.delete(id));return true},
 profileSwitch:async(id:string)=>{
  const s=load();if(!s.list.some(x=>x.id===id))throw Error('Unknown profile');if(id===s.current)return true
  // Put the current profile away first: nothing is removed before it is safely stored.
  const mine=ownEntries()
  await tx('readwrite',st=>st.put(mine,s.current))
  const next:Record<string,string>|undefined=await tx('readonly',st=>st.get(id))
  // A new profile starts empty, in the same language.
  const data=next||(mine.lang?{lang:mine.lang}:{})
  for(const k of Object.keys(mine))localStorage.removeItem(k)
  for(const[k,v]of Object.entries(data))if(!sharedKey(k))try{localStorage.setItem(k,String(v))}catch{}
  s.current=id;save(s)
  setTimeout(()=>location.reload(),30)
  return true
 },
}
