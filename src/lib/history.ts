// History: what was read and watched, newest first (kept on this device, 300 lines).
// One line per chapter / episode and per day: reopening the same one moves it up.
export type HistoryKind='books'|'anime'|'series'|'movies'
export type HistoryLine={at:number,kind:HistoryKind,id:string,name:string,sub:string}
const MAX=300
export const dayOf=(at:number)=>{const d=new Date(at);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
export function readHistory():HistoryLine[]{try{const l=JSON.parse(localStorage.getItem('history')||'[]');return Array.isArray(l)?l:[]}catch{return[]}}
export function logHistory(line:Omit<HistoryLine,'at'>,at=Date.now()){
 if(!line.id||!line.name)return
 const day=dayOf(at),rest=readHistory().filter(x=>!(x.kind===line.kind&&x.id===line.id&&x.sub===line.sub&&dayOf(x.at)===day))
 try{localStorage.setItem('history',JSON.stringify([{...line,at},...rest].slice(0,MAX)))}catch{}}
export function clearHistory(){try{localStorage.removeItem('history')}catch{}}
/** Lines grouped by day, newest day first. */
export function historyDays(list=readHistory()):{day:string,lines:HistoryLine[]}[]{
 const out:{day:string,lines:HistoryLine[]}[]=[]
 for(const x of list){const d=dayOf(x.at),last=out[out.length-1];if(last&&last.day===d)last.lines.push(x);else out.push({day:d,lines:[x]})}
 return out}
/** The latest line of each title (newest first): what the Continue panel shows. */
export function recentTitles(list=readHistory(),max=5):HistoryLine[]{
 const seen=new Set<string>(),out:HistoryLine[]=[]
 for(const x of list){const k=x.kind+'|'+x.id;if(seen.has(k))continue;seen.add(k);out.push(x);if(out.length>=max)break}
 return out}
