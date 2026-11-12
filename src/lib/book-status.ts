// Automatic check of the book sources. Two signals set a source aside (left out of
// search and Discover; it stays listed in Sources, where "Use anyway" brings it back):
//  - the published check (workflow "Book source scan", twice a week) has found it
//    not working for BOOK_DEAD_DAYS days. A site that only blocks the checker
//    (Cloudflare…) is "blocked", never counted;
//  - on this device it failed on FAIL_DAYS different days in a row, with no success.
// A source that works again comes back by itself; a locally set aside one is tried
// again after RETRY_DAYS.
import{lsGet,lsSet}from'./util'
export type BookRow={id:string,name:string,lang:string,state:'ok'|'blocked'|'dead',detail?:string}
export type BookStatus={at:string,results:BookRow[]}
export const BOOK_DEAD_DAYS=5,FAIL_DAYS=3,RETRY_DAYS=14
const DAY=86400e3
const readJson=(k:string,d:any)=>{try{return JSON.parse(lsGet(k)||'null')??d}catch{return d}}
let cache:BookStatus|null=null
export function cachedBookStatus():BookStatus|null{return cache||(cache=readJson('bookScan',null))}
export function trackBookDead(s:BookStatus,now=Date.now()){
 const seen:Record<string,number>=readJson('bookDead',{}),ids=new Set(s.results.map(r=>r.id))
 for(const r of s.results){if(r.state==='dead'){if(!seen[r.id])seen[r.id]=now}else delete seen[r.id]}
 for(const k of Object.keys(seen))if(!ids.has(k))delete seen[k]
 lsSet('bookDead',JSON.stringify(seen))}
// Fetched at most every 12 h; the last copy is kept when offline.
export async function loadBookStatus(force=false):Promise<BookStatus|null>{
 const cur=cachedBookStatus(),fetchedAt=Number(lsGet('bookScanFetched'))||0
 if(!force&&cur&&Date.now()-fetchedAt<12*3600e3)return cur
 const nr:any=(window as any).novelReader;if(!nr?.bookStatus)return cur
 try{const s=await nr.bookStatus();if(s&&Array.isArray(s.results)){cache=s;trackBookDead(s);lsSet('bookScan',JSON.stringify(s));lsSet('bookScanFetched',String(Date.now()));window.dispatchEvent(new Event('nr-book-scan'))}return cache}catch{return cur}}
// Failures seen on this device: one count per day at most, reset by any success.
export type Streak={n:number,at:number}
export function noteBookResult(id:string,ok:boolean,now=Date.now()){
 if(!ok&&typeof navigator!=='undefined'&&navigator.onLine===false)return
 const all:Record<string,Streak>=readJson('bookFails',{}),cur=all[id]
 if(ok){if(!cur)return;delete all[id]}
 else if(!cur)all[id]={n:1,at:now}
 else if(now-cur.at>=DAY)all[id]={n:cur.n+1,at:now}
 else return
 lsSet('bookFails',JSON.stringify(all))}
export function bookAsideReason(id:string,now=Date.now()):''|'check'|'device'{
 if((readJson('bookKeep',[]) as string[]).includes(id))return''
 const since=readJson('bookDead',{})[id],health=readJson('sourceHealth',{})[id]
 // Working here after the check first saw it down: this device knows better.
 if(since&&now-since>=BOOK_DEAD_DAYS*DAY&&!(health?.ok&&health.at>since))return'check'
 const f:Streak|undefined=readJson('bookFails',{})[id]
 if(f&&f.n>=FAIL_DAYS&&now-f.at<RETRY_DAYS*DAY)return'device'
 return''}
export const bookSetAside=(id:string,now=Date.now())=>!!bookAsideReason(id,now)
export function keepBookSource(id:string){const l:string[]=readJson('bookKeep',[]);if(!l.includes(id))lsSet('bookKeep',JSON.stringify([...l,id]));const f=readJson('bookFails',{});delete f[id];lsSet('bookFails',JSON.stringify(f));window.dispatchEvent(new Event('nr-book-scan'))}
