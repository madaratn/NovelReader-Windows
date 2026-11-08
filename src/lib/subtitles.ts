// Subtitle translation: a WebVTT file is split into cues, the texts are translated
// in one batch (same engine as chapter translation) and a new WebVTT is built
// with the same timings.
export type Cue={head:string,text:string}
export function parseVtt(vtt:string){
 const blocks=vtt.replace(/\r/g,'').split(/\n{2,}/)
 const header:string[]=[],cues:Cue[]=[]
 for(const b of blocks){
  const lines=b.split('\n'),i=lines.findIndex(l=>/-->/.test(l))
  if(i<0){if(!cues.length)header.push(b);continue}
  cues.push({head:lines.slice(0,i+1).join('\n'),text:lines.slice(i+1).join('\n').replace(/\s+$/,'')})
 }
 return{header:header.join('\n\n')||'WEBVTT',cues}
}
// Line breaks become <br> so the layout survives translation, then come back.
export async function translateVtt(vtt:string,to:string,translate:(o:{texts:string[],to:string})=>Promise<string[]>){
 const{header,cues}=parseVtt(vtt)
 const texts=cues.map(c=>c.text.replace(/\n/g,'<br>'))
 const out=await translate({texts,to})
 const body=cues.map((c,i)=>c.head+'\n'+String(out[i]??c.text).replace(/\s*<br\s*\/?>\s*/gi,'\n').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&').trim()).join('\n\n')
 return(/^WEBVTT/.test(header)?header:'WEBVTT')+'\n\n'+body+'\n'
}
// Lines written by the AI -> WebVTT.
const vttTime=(s:number)=>{s=Math.max(0,s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+sec.toFixed(3).padStart(6,'0')}
export function vttFromLines(lines:{start:number,end:number,text:string}[]){return 'WEBVTT\n\n'+lines.filter(l=>l.end>l.start&&l.text).map(l=>vttTime(l.start)+' --> '+vttTime(l.end)+'\n'+l.text.replace(/\n{2,}/g,'\n')).join('\n\n')+'\n'}
