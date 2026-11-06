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
