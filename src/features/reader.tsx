import React,{useEffect,useRef,useState}from'react'
import{t,getLang}from'../i18n'
import{markActivity}from'../features/stats'
import{clamp,lsGet,lsSet}from'../lib/util'

// ---- Novel reader preferences ---------------------------------------------
export type ReaderTheme='dark'|'sepia'|'light'|'black'
export type ReaderPrefs={theme:ReaderTheme,size:number,leading:number,width:'narrow'|'medium'|'wide'|'full',font:'serif'|'sans'}
export const READER_DEFAULTS:ReaderPrefs={theme:'dark',size:20,leading:1.85,width:'full',font:'serif'}
export const READER_WIDTHS={narrow:'640px',medium:'760px',wide:'920px',full:'none'}
export const READER_FONTS={serif:"Georgia,'Iowan Old Style','Palatino Linotype',serif",sans:"'Segoe UI',Inter,system-ui,sans-serif"}
export const READER_THEMES:{id:ReaderTheme,label:string}[]=[{id:'dark',label:'Dark'},{id:'sepia',label:'Sepia'},{id:'light',label:'Light'},{id:'black',label:'Black'}]
export function loadReaderPrefs():ReaderPrefs{let saved:any={};try{saved=JSON.parse(localStorage.getItem('readerPrefs')||'{}')||{}}catch{}const legacy=lsGet('readerTheme');const appLight=document.documentElement.dataset.theme==='light';const p={...READER_DEFAULTS,...(legacy==='light'||(!legacy&&appLight)?{theme:'light'}:{}),...saved};return{theme:READER_THEMES.some(t=>t.id===p.theme)?p.theme:'dark',size:clamp(Number(p.size)||20,14,32),leading:clamp(Number(p.leading)||1.85,1.3,2.4),width:p.width in READER_WIDTHS?p.width:'full',font:p.font==='sans'?'sans':'serif'}}
export function ReaderSettings({prefs,onChange,onClose}:{prefs:ReaderPrefs,onChange:(p:Partial<ReaderPrefs>)=>void,onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null)
 useEffect(()=>{ref.current?.querySelector<HTMLElement>('button')?.focus();const away=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node)&&!(e.target as HTMLElement).closest?.('.readersettings-btn'))onClose()};document.addEventListener('mousedown',away);return()=>document.removeEventListener('mousedown',away)},[])
 const seg=(key:'width'|'font',opts:[string,string][])=><div className="rs-seg" role="radiogroup">{opts.map(([v,l])=><button key={v} role="radio" aria-checked={prefs[key]===v} className={prefs[key]===v?'on':''} onClick={()=>onChange({[key]:v} as any)}>{l}</button>)}</div>
 return <div className="readersettings" ref={ref} role="dialog" aria-label={t('Reading settings')}>
  <div className="rs-row"><span>{t('Theme')}</span><div className="rs-themes">{READER_THEMES.map(th=><button key={th.id} className={'rs-swatch sw-'+th.id+(prefs.theme===th.id?' on':'')} aria-pressed={prefs.theme===th.id} onClick={()=>onChange({theme:th.id})}>{t(th.label)}</button>)}</div></div>
  <div className="rs-row"><span>{t('Text size')}</span><div className="rs-step"><button aria-label={t('Smaller text')} onClick={()=>onChange({size:clamp(prefs.size-1,14,32)})}>A−</button><output>{prefs.size}px</output><button aria-label={t('Larger text')} onClick={()=>onChange({size:clamp(prefs.size+1,14,32)})}>A+</button></div></div>
  <div className="rs-row"><span>{t('Line spacing')}</span><div className="rs-step"><button aria-label={t('Tighter lines')} onClick={()=>onChange({leading:clamp(Math.round((prefs.leading-0.1)*10)/10,1.3,2.4)})}>−</button><output>{prefs.leading.toFixed(1)}</output><button aria-label={t('Looser lines')} onClick={()=>onChange({leading:clamp(Math.round((prefs.leading+0.1)*10)/10,1.3,2.4)})}>+</button></div></div>
  <div className="rs-row"><span>{t('Width')}</span>{seg('width',[['narrow',t('Narrow')],['medium',t('Medium')],['wide',t('Wide')],['full',t('Full')]])}</div>
  <div className="rs-row"><span>{t('Font')}</span>{seg('font',[['serif','Serif'],['sans','Sans']])}</div>
  <div className="rs-foot"><button className="rs-reset" onClick={()=>onChange(READER_DEFAULTS)}>{t('Reset')}</button><small>{t('← → chapters · + − text size')}</small></div>
 </div>
}

// ---- Read aloud (Web Speech API, uses the voices installed in Windows) ------------
export type TtsPrefs={rate:number,voice:string,autoNext:boolean}
export function loadTts():TtsPrefs{try{const x=JSON.parse(lsGet('ttsPrefs')||'{}')||{};return{rate:clamp(Number(x.rate)||1,0.5,2.5),voice:typeof x.voice==='string'?x.voice:'',autoNext:x.autoNext!==false}}catch{return{rate:1,voice:'',autoNext:true}}}
export function useVoices(){const[v,setV]=useState<SpeechSynthesisVoice[]>([]);useEffect(()=>{const ss=window.speechSynthesis;if(!ss)return;const upd=()=>setV(ss.getVoices());upd();ss.addEventListener?.('voiceschanged',upd);return()=>ss.removeEventListener?.('voiceschanged',upd)},[]);return v}
export function readableBlocks(root:HTMLElement|null):HTMLElement[]{if(!root)return[];const els=[...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,li,blockquote')].filter(e=>(e.textContent||'').trim().length>1&&!e.querySelector('p,li,blockquote'));return els.length?els:[root]}
export function ReaderTTS({rootRef,chapterKey,hasNext,onNext,onClose}:{rootRef:React.RefObject<HTMLElement|null>,chapterKey:string,hasNext:boolean,onNext:()=>void,onClose:()=>void}){
 const voices=useVoices(),[prefs,setPrefs]=useState<TtsPrefs>(loadTts),[playing,setPlaying]=useState(false),[idx,setIdx]=useState(0),[err,setErr]=useState('')
 const playingRef=useRef(false),idxRef=useRef(0),token=useRef(0),pendingNext=useRef(false),prefsRef=useRef(prefs)
 prefsRef.current=prefs
 const supported=typeof window!=='undefined'&&'speechSynthesis' in window
 const savePrefs=(patch:Partial<TtsPrefs>)=>setPrefs(p=>{const n={...p,...patch};lsSet('ttsPrefs',JSON.stringify(n));return n})
 const mark=(i:number)=>{const els=readableBlocks(rootRef.current);els.forEach((e,j)=>e.classList.toggle('tts-current',j===i));return els}
 const voiceFor=()=>{const vs=window.speechSynthesis.getVoices();return vs.find(v=>v.voiceURI===prefsRef.current.voice)||vs.find(v=>v.lang.toLowerCase().startsWith(getLang()))||null}
 const speak=(i:number)=>{
  const els=readableBlocks(rootRef.current)
  if(i>=els.length){mark(-1);if(prefsRef.current.autoNext&&hasNextRef.current){pendingNext.current=true;onNextRef.current()}else{playingRef.current=false;setPlaying(false);idxRef.current=0;setIdx(0)}return}
  idxRef.current=i;setIdx(i);mark(i);markActivity()
  els[i].scrollIntoView({block:'center',behavior:'smooth'})
  const u=new SpeechSynthesisUtterance((els[i].textContent||'').replace(/\s+/g,' ').trim())
  const v=voiceFor();if(v){u.voice=v;u.lang=v.lang}
  u.rate=prefsRef.current.rate
  const tok=++token.current
  u.onend=()=>{if(tok===token.current&&playingRef.current)speak(i+1)}
  u.onerror=(e:any)=>{if(tok!==token.current||e?.error==='interrupted'||e?.error==='canceled')return;setErr(t('The voice stopped unexpectedly.')+' ('+(e?.error||'error')+')');playingRef.current=false;setPlaying(false)}
  window.speechSynthesis.cancel();window.speechSynthesis.speak(u)
 }
 const hasNextRef=useRef(hasNext),onNextRef=useRef(onNext);hasNextRef.current=hasNext;onNextRef.current=onNext
 const play=()=>{if(!supported)return;setErr('');playingRef.current=true;setPlaying(true);speak(idxRef.current)}
 const pause=()=>{playingRef.current=false;setPlaying(false);token.current++;window.speechSynthesis?.cancel()}
 const jump=(d:number)=>{const n=Math.max(0,Math.min(readableBlocks(rootRef.current).length-1,idxRef.current+d));if(playingRef.current)speak(n);else{idxRef.current=n;setIdx(n);mark(n)}}
 // New chapter: start over, and keep reading if we got here by finishing the previous one.
 useEffect(()=>{idxRef.current=0;setIdx(0);mark(-1);if(pendingNext.current&&playingRef.current){pendingNext.current=false;const tm=setTimeout(()=>speak(0),400);return()=>clearTimeout(tm)}pendingNext.current=false},[chapterKey])
 // Click a paragraph to read from there.
 useEffect(()=>{const root=rootRef.current;if(!root)return;const onClick=(e:MouseEvent)=>{if((e.target as HTMLElement).closest('a'))return;if(!(window.getSelection()?.isCollapsed??true))return;const els=readableBlocks(root);const i=els.findIndex(el=>el.contains(e.target as Node));if(i<0)return;if(playingRef.current)speak(i);else{idxRef.current=i;setIdx(i);mark(i)}};root.addEventListener('click',onClick);root.classList.add('tts-on');return()=>{root.removeEventListener('click',onClick);root.classList.remove('tts-on')}},[chapterKey])
 useEffect(()=>()=>{token.current++;window.speechSynthesis?.cancel();mark(-1)},[])
 const total=readableBlocks(rootRef.current).length
 return <div className="tts-panel" role="region" aria-label={t('Read aloud')}>
  {!supported?<span>{t('Read aloud is not available on this system.')}</span>:<>
   <div className="tts-main">
    <button className="tts-btn" onClick={()=>jump(-1)} aria-label={t('Previous paragraph')} title={t('Previous paragraph')}>⏮</button>
    <button className="tts-btn tts-play" onClick={playing?pause:play} aria-label={playing?t('Pause'):t('Read aloud')}>{playing?'❚❚':'▶'}</button>
    <button className="tts-btn" onClick={()=>jump(1)} aria-label={t('Next paragraph')} title={t('Next paragraph')}>⏭</button>
    <small className="tts-pos">{t('Paragraph {n} of {total}',{n:Math.min(idx+1,Math.max(total,1)),total:Math.max(total,1)})}</small>
   </div>
   <div className="tts-opts">
    <label>{t('Speed')}<select value={String(prefs.rate)} onChange={e=>{savePrefs({rate:Number(e.target.value)});if(playingRef.current)setTimeout(()=>speak(idxRef.current),0)}}>{[0.75,1,1.25,1.5,1.75,2].map(r=><option key={r} value={String(r)}>{r}×</option>)}</select></label>
    <label>{t('Voice')}<select value={prefs.voice} onChange={e=>{savePrefs({voice:e.target.value});if(playingRef.current)setTimeout(()=>speak(idxRef.current),0)}}><option value="">{t('Automatic')}</option>{voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label>
    <label className="tts-check"><input type="checkbox" checked={prefs.autoNext} onChange={e=>savePrefs({autoNext:e.target.checked})}/> {t('Continue to the next chapter')}</label>
   </div>
   {err&&<small className="tts-err">{err}</small>}
  </>}
  <button className="tts-close" onClick={()=>{pause();onClose()}} aria-label={t('Close')}>×</button>
 </div>
}

// React 19 re-applies dangerouslySetInnerHTML whenever the prop object changes,
// which rebuilt the whole chapter on every scroll-driven render (losing text
// selection and highlights). Keep one stable object per chapter content.
export const chapterHtmlCache={src:null as any,obj:{__html:''}}
export function chapterHtml(content:any){if(content!==chapterHtmlCache.src){chapterHtmlCache.src=content;chapterHtmlCache.obj={__html:String(content||'').replace(/<script[\s\S]*?<\/script>/gi,'')}}return chapterHtmlCache.obj}

// ---- Find in chapter (Ctrl+F) — uses the CSS Custom Highlight API, no DOM changes ----
export function FindBar({rootRef,chapterKey,onClose}:{rootRef:React.RefObject<HTMLElement|null>,chapterKey:string,onClose:()=>void}){
 const[q,setQ]=useState(''),[count,setCount]=useState(0),[cur,setCur]=useState(0),ranges=useRef<Range[]>([]),input=useRef<HTMLInputElement>(null)
 const hl=(window as any).CSS?.highlights,Highlight=(window as any).Highlight
 const clear=()=>{try{hl?.delete('nr-find');hl?.delete('nr-find-current')}catch{}}
 const show=(i:number)=>{const r=ranges.current[i];if(!r||!hl||!Highlight)return;hl.set('nr-find-current',new Highlight(r));const b=r.getBoundingClientRect();if(b.top<90||b.bottom>window.innerHeight-90)window.scrollBy({top:b.top-window.innerHeight/2,behavior:'smooth'})}
 useEffect(()=>{input.current?.focus();input.current?.select()},[])
 useEffect(()=>{
  clear();ranges.current=[];const root=rootRef.current,needle=q.trim().toLowerCase()
  if(!root||needle.length<2){setCount(0);setCur(0);return}
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node:Node|null
  while((node=walker.nextNode())){const text=(node.textContent||'').toLowerCase();let at=text.indexOf(needle);while(at>=0&&ranges.current.length<2000){const r=document.createRange();r.setStart(node,at);r.setEnd(node,at+needle.length);ranges.current.push(r);at=text.indexOf(needle,at+needle.length)}}
  setCount(ranges.current.length);setCur(0)
  if(ranges.current.length&&hl&&Highlight){hl.set('nr-find',new Highlight(...ranges.current));show(0)}
 },[q,chapterKey])
 useEffect(()=>()=>clear(),[])
 const step=(d:number)=>{if(!count)return;const n=(cur+d+count)%count;setCur(n);show(n)}
 return <div className="findbar" role="search">
  <input ref={input} value={q} placeholder={t('Find in chapter…')} aria-label={t('Find in chapter…')} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();step(e.shiftKey?-1:1)}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose()}}}/>
  <small className="findcount">{q.trim().length<2?'':count?t('{i} of {n}',{i:cur+1,n:count}):t('No match')}</small>
  <button onClick={()=>step(-1)} disabled={!count} aria-label={t('Previous match')}>↑</button><button onClick={()=>step(1)} disabled={!count} aria-label={t('Next match')}>↓</button>
  <button onClick={onClose} aria-label={t('Close')}>×</button>
 </div>
}
