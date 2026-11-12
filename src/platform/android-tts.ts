// Read aloud on Android. The WebView has no voices, so the browser's speechSynthesis
// (which the reader uses, features/reader.tsx) is provided here on top of the phone's
// own text-to-speech (TtsPlugin.java). Same calls, same events: one paragraph at a
// time, word boundaries, cancel. While a reading goes on, the app is kept alive with
// the screen off (TtsPlugin.hold); 20 s without a new paragraph ends that.
type Voice={voiceURI:string,name:string,lang:string,localService:boolean,default:boolean}
export function installAndroidTts(P:any,w:any=window){
 if(!P||w.__nrTts)return;w.__nrTts=true
 let voices:Voice[]=[],seq=0,current:{id:string,u:any}|null=null,holding=false,release:any=0
 const target=new EventTarget()
 const hold=(on:boolean)=>{clearTimeout(release);if(on){if(!holding){holding=true;P.hold({on:true}).catch(()=>{})}}else release=setTimeout(()=>{if(!current&&holding){holding=false;P.hold({on:false}).catch(()=>{})}},20000)}
 const loadVoices=()=>P.voices().then((r:any)=>{voices=(r?.voices||[]).map((v:any)=>({...v,default:false}));target.dispatchEvent(new Event('voiceschanged'));synth.onvoiceschanged?.(new Event('voiceschanged'))}).catch(()=>{})
 class Utterance{text:string;lang='';voice:Voice|null=null;rate=1;pitch=1;volume=1;onstart:any=null;onend:any=null;onerror:any=null;onboundary:any=null
  constructor(text=''){this.text=String(text)}}
 const synth:any={
  get speaking(){return!!current},pending:false,paused:false,onvoiceschanged:null,
  getVoices:()=>voices.slice(),
  speak(u:any){const id=String(++seq);current={id,u};hold(true)
   P.speak({id,text:u.text,voice:u.voice?.voiceURI||'',lang:u.lang||u.voice?.lang||'',rate:Number(u.rate)||1}).catch((e:any)=>{if(current?.id!==id)return;current=null;hold(false);u.onerror?.({error:'synthesis-failed',message:String(e?.message||e)})})},
  cancel(){const c=current;current=null;P.cancel().catch(()=>{});hold(false);c?.u.onerror?.({error:'interrupted'})},
  pause(){},resume(){},
  addEventListener:(t:string,f:any)=>target.addEventListener(t,f),removeEventListener:(t:string,f:any)=>target.removeEventListener(t,f),
 }
 P.addListener('tts',(e:any)=>{
  if(e.type==='ready'){loadVoices();return}
  // "Stop" on the notification: the reader pauses (it listens to this event).
  if(e.type==='stopped'){current=null;hold(false);w.dispatchEvent(new Event('nr-tts-stop'));return}
  const c=current;if(!c||c.id!==String(e.id))return
  if(e.type==='start')c.u.onstart?.({})
  else if(e.type==='boundary')c.u.onboundary?.({name:'word',charIndex:e.start,charLength:Math.max(0,e.end-e.start)})
  else if(e.type==='end'){current=null;hold(false);c.u.onend?.({})}
  else if(e.type==='error'){current=null;hold(false);c.u.onerror?.({error:'synthesis-failed'})}})
 try{Object.defineProperty(w,'speechSynthesis',{value:synth,configurable:true})}catch{w.speechSynthesis=synth}
 w.SpeechSynthesisUtterance=Utterance
 loadVoices()}
