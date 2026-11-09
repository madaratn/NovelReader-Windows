// Online subtitles on Android: the same as electron/subtitles.cjs (IMDb suggestions ->
// Wyzie Subs -> WebVTT), run in the app (fetch goes through Android, no CORS).
// The AI subtitles (whisper.cpp) stay on the PC.
function decode(buf:Uint8Array,encoding=''){
 const enc=String(encoding||'').toLowerCase()
 if(buf[0]===0xEF&&buf[1]===0xBB&&buf[2]===0xBF)return new TextDecoder('utf-8').decode(buf.subarray(3))
 if(buf[0]===0xFF&&buf[1]===0xFE)return new TextDecoder('utf-16le').decode(buf.subarray(2))
 if(enc&&!/utf-?8/.test(enc)){try{return new TextDecoder(enc).decode(buf)}catch{}}
 const utf=new TextDecoder('utf-8').decode(buf);if(!utf.includes('\uFFFD'))return utf
 try{return new TextDecoder('windows-1252').decode(buf)}catch{return utf}
}
function assToVtt(s:string){
 const ts=(x:string)=>{const m=/(\d+):(\d\d):(\d\d)[.](\d\d)/.exec(x);return m?`${m[1].padStart(2,'0')}:${m[2]}:${m[3]}.${m[4]}0`:'00:00:00.000'}
 const out=['WEBVTT','']
 for(const line of s.split('\n')){if(!/^Dialogue:/i.test(line))continue;const parts=line.slice(9).split(',');if(parts.length<10)continue;const text=parts.slice(9).join(',').replace(/\{[^}]*\}/g,'').replace(/\\N/gi,'\n').trim();if(text)out.push(`${ts(parts[1])} --> ${ts(parts[2])}`,text,'')}
 return out.join('\n')
}
export function srtToVtt(text:string){
 let s=String(text).replace(/^\uFEFF/,'').replace(/\r/g,'')
 if(/^\s*WEBVTT/.test(s))return s
 if(/^\s*\[Script Info\]/i.test(s))return assToVtt(s)
 s=s.replace(/(\d{1,2}:\d\d:\d\d)[,.](\d{1,3})/g,(_m,a,b)=>a.padStart(8,'0')+'.'+b.padEnd(3,'0'))
 s=s.replace(/\{\\[^}]*\}/g,'')
 return 'WEBVTT\n\n'+s.trim()+'\n'
}
async function imdbFind(title:string,{year,kind}:{year?:number,kind?:string}={}){
 const q=String(title||'').replace(/\((?:dub|sub|vf|vostfr)\)|\[[^\]]*\]/ig,'').replace(/\s+/g,' ').trim().toLowerCase()
 if(!q)throw Error('No title')
 const r=await fetch('https://v2.sg.media-imdb.com/suggestion/'+encodeURIComponent(q[0])+'/'+encodeURIComponent(q)+'.json')
 if(!r.ok)throw Error('IMDb HTTP '+r.status)
 const d=await r.json()
 const want=kind==='movie'?/^movie|tvMovie/:/^tv(Series|MiniSeries)/
 const list=(d.d||[]).filter((x:any)=>/^tt\d+$/.test(x.id||'')&&want.test(String(x.qid||'')))
 const norm=(x:any)=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
 const hit=list.find((x:any)=>norm(x.l)===norm(q)&&(!year||Math.abs((x.y||0)-year)<=1))||list.find((x:any)=>norm(x.l)===norm(q))||list[0]
 return hit?{id:hit.id,title:hit.l,year:hit.y||0}:null
}
export async function subsSearch({title,year,kind,season,episode,langs=['fr','en'],key}:any){
 if(!key)throw Error('NO_KEY')
 const imdb=await imdbFind(title,{year,kind});if(!imdb)return{imdb:null,results:[]}
 const q=new URLSearchParams({id:imdb.id,key:String(key)})
 if(kind!=='movie'&&season&&episode){q.set('season',String(season));q.set('episode',String(episode))}
 if(langs.length)q.set('language',langs.join(','))
 const r=await fetch('https://sub.wyzie.io/search?'+q.toString())
 if(r.status===401||r.status===403)throw Error('BAD_KEY')
 if(r.status===429)throw Error('LIMIT')
 if(!r.ok)throw Error('Wyzie HTTP '+r.status)
 const list=await r.json()
 const results=(Array.isArray(list)?list:[]).filter((x:any)=>x&&x.url&&/^(srt|vtt|ass|ssa|sub)$/i.test(String(x.format||'srt'))).map((x:any)=>({id:String(x.id),url:String(x.url),language:String(x.language||''),display:String(x.display||x.language||''),release:String(x.release||x.fileName||''),source:String(x.source||''),format:String(x.format||'srt'),encoding:String(x.encoding||''),hi:!!x.isHearingImpaired,downloads:Number(x.downloadCount)||0}))
 results.sort((a:any,b:any)=>langs.indexOf(a.language)-langs.indexOf(b.language)||Number(a.hi)-Number(b.hi)||b.downloads-a.downloads)
 return{imdb,results}
}
export async function subsFetch({url,encoding}:{url:string,encoding?:string}){
 if(!/^https:\/\//i.test(String(url)))throw Error('Bad subtitle address')
 const r=await fetch(url);if(!r.ok)throw Error('Subtitle HTTP '+r.status)
 const buf=new Uint8Array(await r.arrayBuffer())
 if(buf.length>8e6)throw Error('Subtitle file too big')
 if(buf[0]===0x50&&buf[1]===0x4B){
  const JSZip=(await import('jszip')).default;const z=await JSZip.loadAsync(buf);const f=Object.values(z.files).find((f:any)=>/\.(srt|vtt|ass|ssa)$/i.test(f.name))
  if(!f)throw Error('No subtitle in the archive');return srtToVtt(decode(await (f as any).async('uint8array'),encoding))}
 return srtToVtt(decode(buf,encoding))
}
