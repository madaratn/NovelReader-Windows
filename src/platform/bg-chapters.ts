// New chapters while the app is closed (Android). Every 6 hours the system starts a
// hidden page of the app (ChapterCheck.java -> index.html#bg-chapters); this file is
// all that page runs: it asks each book source for the chapter list of the novels in
// the library and tells Android which ones have more chapters than last time.
// No Capacitor there: requests go through the small bridge window.NRBackground.
import * as plugins from './plugin-runtime'

type Native={http:(id:number,json:string)=>void,done:(json:string)=>void}
export function nativeFetch(N:Native){
 let seq=0;const waiting=new Map<number,(r:any)=>void>()
 ;(window as any).__nrHttp=(id:number,res:any)=>{const w=waiting.get(id);waiting.delete(id);if(w)w(res)}
 return async(input:any,init:any={}):Promise<Response>=>{
  const url=String(typeof input==='string'?input:input?.url||input),method=String(init.method||(typeof input==='object'&&input?.method)||'GET').toUpperCase(),headers:Record<string,string>={}
  new Headers(init.headers||(typeof input==='object'&&input?.headers)||{}).forEach((v,k)=>{headers[k]=v})
  let body:any=init.body
  if(body instanceof URLSearchParams){body=body.toString();if(!headers['content-type'])headers['content-type']='application/x-www-form-urlencoded'}
  else if(typeof FormData!=='undefined'&&body instanceof FormData){const p=new URLSearchParams();body.forEach((v:any,k:string)=>p.append(k,String(v)));body=p.toString();headers['content-type']='application/x-www-form-urlencoded'}
  else if(body!=null&&typeof body!=='string')body=String(body)
  const res:any=await new Promise(ok=>{const id=++seq;waiting.set(id,ok);N.http(id,JSON.stringify({url,method,headers,body:body??null}))})
  if(res.error)throw new TypeError(String(res.error))
  const bin=atob(res.body||''),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i)
  const r=new Response(res.status===204||res.status===304?null:bytes,{status:res.status>=200&&res.status<=599?res.status:502,headers:res.headers||{}})
  try{Object.defineProperty(r,'url',{value:res.url||url})}catch{}
  return r}}
const read=(k:string)=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}}
/** Novels with more chapters than last seen (first sight: the count saved in the library). */
export async function checkChapters(parse:(source:any,path:string)=>Promise<any>,budgetMs=4*60*1000){
 if(localStorage.getItem('autoCheckUpdates')==='0'||localStorage.getItem('notifyNewChapters')==='0')return{skipped:true,names:[] as string[],checked:0}
 const library:any[]=(read('library')||[]).filter((n:any)=>n&&n.source&&n.path&&n.shelf!=='dropped'),seen:Record<string,number>=read('bgChapterSeen')||{}
 const names:string[]=[],queue=[...library],end=Date.now()+budgetMs;let checked=0
 await Promise.all(Array.from({length:3},async()=>{while(queue.length&&Date.now()<end){const n=queue.shift()
  try{const d:any=await Promise.race([parse(n.source,n.path),new Promise((_,ko)=>setTimeout(()=>ko(Error('timeout')),30000))])
   const now=Array.isArray(d?.chapters)?d.chapters.length:0;if(!now)continue
   const before=seen[n.id]??(n.chapters?.length||Number(n.chapterCount)||0)
   if(before>0&&now>before)names.push(String(n.name||''))
   seen[n.id]=Math.max(now,before);checked++}catch{}}}))
 localStorage.setItem('bgChapterSeen',JSON.stringify(seen))
 // The app marks the new chapters itself: let its own check run as soon as it opens.
 if(names.length)localStorage.setItem('lastUpdateCheck','0')
 return{skipped:false,names,checked}}
export async function runBackgroundChapters(){
 const N:Native=(window as any).NRBackground;if(!N)return
 let out:any={names:[],checked:0}
 try{(window as any).fetch=nativeFetch(N);out=await checkChapters((s,p)=>plugins.parseNovel(s,p))}catch(e:any){out={names:[],checked:0,error:String(e?.message||e)}}
 N.done(JSON.stringify(out))}
