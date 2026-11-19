// The next chapter is fetched while the current one is read, so "Next" opens at once
// instead of after the time the site takes to answer. One chapter ahead and no more
// (one request per chapter read, as when reading without it), kept in memory; a
// chapter downloaded for offline reading is taken from the disk, and nothing is
// fetched without a connection.
const ahead=new Map<string,Promise<any>>()
const keyOf=(novelId:string,path:string)=>novelId+'\n'+path
/** The chapter fetched ahead, if it was (given once: a second opening asks the site again). */
export function takeAhead(novelId:string,path:string):Promise<any>|null{const k=keyOf(String(novelId),String(path)),p=ahead.get(k)||null;ahead.delete(k);return p}
/** Fetches the chapter after `index` a moment after the current one is shown. */
export function readAhead(novel:any,index:number,load:(path:string)=>Promise<any>,delay=1500){
 const next=novel?.chapters?.[index+1],path=next&&(next.path||next.url)
 if(!path||(typeof navigator!=='undefined'&&navigator.onLine===false))return
 const k=keyOf(String(novel.id),String(path));if(ahead.has(k))return
 setTimeout(()=>{if(ahead.has(k)||(typeof navigator!=='undefined'&&navigator.onLine===false))return
  const p=load(String(path));ahead.set(k,p);p.catch(()=>{if(ahead.get(k)===p)ahead.delete(k)})
  while(ahead.size>3)ahead.delete(ahead.keys().next().value as string)},delay)}
export const _test={ahead}
