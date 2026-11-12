// "💬 Find subtitles" in the player: subtitles for any video.
// Online (Wyzie Subs, free key in Settings) for films and series, or written by AI on
// this PC (whisper.cpp) for anything else — a little ahead of playback, then
// translated into the app language when the video speaks another one.
import React,{useEffect,useRef,useState}from'react'
import{t,getLang}from'../i18n'
import{lsGet,lsSet}from'../lib/util'
import{vttFromLines}from'../lib/subtitles'
import{TRANSLATE_LANGS,translateTarget}from'./translate'
import{Icon}from'../ui/common'

export type SubInfo={kind:'anime'|'series'|'movie',title:string,year?:number,season?:number,episode?:number}
const nr=()=>window.novelReader as any
const clean=(e:any)=>String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,'')
const LANG_LABEL:Record<string,string>={fr:'Français',en:'English',es:'Español',de:'Deutsch',it:'Italiano',pt:'Português',ar:'العربية',ja:'日本語',ko:'한국어',zh:'中文',ru:'Русский',tr:'Türkçe',hi:'हिन्दी',id:'Indonesia',vi:'Tiếng Việt',th:'ไทย',pl:'Polski',nl:'Nederlands'}
export const subLangName=(l:string)=>LANG_LABEL[String(l).toLowerCase()]||String(l||'?').toUpperCase()
export const wyzieKey=()=>lsGet('wyzieKey')||''
// Language of the subtitles (search order, AI translation, "Translate into"):
// its own choice, else the chapter translation language, else the app language.
export const SUB_LANGS=TRANSLATE_LANGS
export const subtitleLang=()=>lsGet('subTranslateTo')||translateTarget()
export const setSubtitleLang=(l:string)=>{lsSet('subTranslateTo',l);window.dispatchEvent(new Event('nr-sub-lang'))}
export function useSubtitleLang(){const[l,setL]=useState(subtitleLang);useEffect(()=>{const f=()=>setL(subtitleLang());window.addEventListener('nr-sub-lang',f);return()=>window.removeEventListener('nr-sub-lang',f)},[]);return l}
export function SubLangPicker({label}:{label?:string}){const l=useSubtitleLang();return <label className="sub-lang">{label??t('Subtitle language')}<select value={l} onChange={e=>setSubtitleLang(e.target.value)} aria-label={t('Subtitle language')}>{SUB_LANGS.map(([c,n])=><option key={c} value={c}>{n}</option>)}</select></label>}
// AI subtitles run whisper.cpp on the PC (not on Android).
const aiSupported=()=>!document.documentElement.classList.contains('android')
const aiSize=()=>lsGet('aiSubSize')==='small'?'small':'base'
const CHUNK=30,AHEAD=90

export function useSubFinder({ref,streamUrl,info,haveSubs,addSub}:{ref:React.RefObject<HTMLVideoElement|null>,streamUrl:string,info?:SubInfo,haveSubs:boolean,addSub:(id:string,name:string,lang:string,text:string,select?:boolean)=>void}){
 const[open,setOpen]=useState(false),[results,setResults]=useState<OnlineSub[]|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[ai,setAi]=useState<{state:'off'|'preparing'|'on',step?:string,p?:number,lines:number,lang?:string,error?:string}>({state:'off',lines:0})
 const session=useRef(0),auto=useRef('')
 const supported=typeof nr()?.subsSearch==='function'
 const target=useSubtitleLang(),ui=target.slice(0,2),langs=[...new Set([ui,'en'])]
 const aiLines=useRef<{orig:{start:number,end:number,text:string}[],shown:{start:number,end:number,text:string}[],to:string,lang:string}>({orig:[],shown:[],to:'',lang:''})
 // A new video: AI stops, the list is for that video.
 useEffect(()=>{session.current++;setResults(null);setError('');setAi({state:'off',lines:0})},[streamUrl])
 useEffect(()=>()=>{session.current++},[])
 useEffect(()=>{if(open&&results!=null&&wyzieKey()&&info?.title&&info.kind!=='anime')searchOnline()},[target])
 async function searchOnline(){
  if(!info?.title)return
  setBusy('search');setError('')
  try{const r=await nr().subsSearch({...info,langs,key:wyzieKey()});setResults(r.results||[]);if(!r.imdb)setError(t('This title was not found in the film and series database.'));return r.results||[]}
  catch(e){const m=clean(e);setError(m==='NO_KEY'?t('Add your free Wyzie Subs key in Settings › Subtitles first.'):m==='BAD_KEY'?t('The Wyzie Subs key was refused. Check it in Settings › Subtitles.'):m==='LIMIT'?t('Daily limit of the subtitle service reached. Try again tomorrow, or use the AI.'):m);setResults([]);return[]}
  finally{setBusy('')}
 }
 async function useOnline(s:OnlineSub){setBusy(s.id);setError('');try{const text=await nr().subsFetch({url:s.url,encoding:s.encoding});addSub('online:'+s.id,subLangName(s.language)+' · '+t('online'),s.language,text);setOpen(false)}catch(e){setError(t('Could not download these subtitles: {e}',{e:clean(e)}))}finally{setBusy('')}}
 async function startAi(){
  const my=++session.current
  setAi({state:'preparing',lines:0});setError('')
  const off=nr().onSubsAiProgress?.((p:any)=>{if(my===session.current)setAi(a=>({...a,step:p.step,p:p.p}))})
  try{await nr().subsAiPrepare(aiSize())}catch(e){setAi({state:'off',lines:0,error:t('The AI could not be installed: {e}',{e:clean(e)})});return}finally{off?.()}
  if(my!==session.current)return
  setAi({state:'on',lines:0})
  const done=new Set<number>(),st=aiLines.current;st.orig=[];st.shown=[];st.to='';st.lang=''
  const want=()=>subtitleLang()
  const tr=async(list:{start:number,end:number,text:string}[],to:string)=>{if(!list.length||!st.lang||st.lang===to.slice(0,2)||lsGet('aiSubTranslate')==='0'||!nr().translate)return list;try{const out=await nr().translate({texts:list.map(x=>x.text),to});return list.map((x,i)=>({...x,text:String(out[i]||x.text)}))}catch{return list}}
  const show=(my2:number)=>{if(my2!==session.current)return;const to=st.to,translated=st.lang&&st.lang!==to.slice(0,2)&&lsGet('aiSubTranslate')!=='0';addSub('ai',t('AI')+' · '+subLangName(translated?to.slice(0,2):st.lang||to.slice(0,2)),translated?to:st.lang||to,vttFromLines(st.shown),true);setAi(a=>({...a,lines:st.shown.length,lang:st.lang}))}
  while(my===session.current){
   // Another subtitle language was chosen: everything written so far is translated again.
   if(st.to&&st.to!==want()&&st.orig.length){st.to=want();st.shown=await tr(st.orig,st.to);show(my);continue}
   const v=ref.current;if(!v){await new Promise(r=>setTimeout(r,1000));continue}
   const now=v.currentTime,first=Math.floor(now/CHUNK)*CHUNK
   let next=-1;for(let s=first;s<now+AHEAD&&s<(v.duration||Infinity);s+=CHUNK)if(!done.has(s)){next=s;break}
   if(next<0){await new Promise(r=>setTimeout(r,1500));continue}
   done.add(next)
   try{
    const r=await nr().subsAiChunk({src:streamUrl,start:next,dur:CHUNK,lang:st.lang||'auto',size:aiSize()})
    if(my!==session.current)return
    if(!st.lang&&r.language&&r.language!=='auto')st.lang=String(r.language).slice(0,2)
    const got=r.lines||[]
    st.to=want()
    st.orig.push(...got);st.orig.sort((a,b)=>a.start-b.start)
    // Translated into the chosen subtitle language when the video speaks another one.
    st.shown.push(...await tr(got,st.to));st.shown.sort((a,b)=>a.start-b.start)
    show(my)
   }catch(e){if(my===session.current)setAi(a=>({...a,error:clean(e)}));await new Promise(r=>setTimeout(r,3000))}
  }
 }
 const stopAi=()=>{session.current++;setAi({state:'off',lines:0})}
 // Automatic: no subtitle at all after a few seconds of playback.
 useEffect(()=>{if(!supported||!streamUrl||auto.current===streamUrl)return
  const tm=setTimeout(async()=>{if(haveSubs||auto.current===streamUrl)return;auto.current=streamUrl
   if(lsGet('subAutoOnline')!=='0'&&wyzieKey()&&info?.title&&info.kind!=='anime'){const list=await searchOnline();const best=list.find(s=>s.language===ui)||list.find(s=>s.language==='en');if(best){await useOnline(best);return}}
   if(lsGet('aiSubAuto')==='1'&&aiSupported())startAi()},8000)
  return()=>clearTimeout(tm)},[streamUrl,haveSubs])
 if(!supported||!streamUrl)return{button:null,panel:null}
 const stepName=(s?:string)=>s==='ffmpeg'?t('sound tool'):s==='whisper'?t('AI program'):s==='model'?t('AI model'):''
 const button=<button className={'trackbtn'+(ai.state!=='off'?' on':'')} aria-expanded={open} onClick={()=>{setOpen(o=>!o);if(!open&&results==null&&wyzieKey()&&info?.title&&info.kind!=='anime')searchOnline()}} title={t('Find subtitles')}><Icon name="chat" inline/>{t('Subtitles')}</button>
 const panel=open?<div className="sub-finder" role="dialog" aria-label={t('Find subtitles')}>
  <div className="sub-finder-lang"><SubLangPicker/><small>{t('Used for the online search and to translate subtitles.')}</small></div>
  <section><b><Icon name="search" inline/>{t('Online')}</b>
   {!wyzieKey()?<p className="cast-help">{t('Films and series: add your free Wyzie Subs key in Settings › Subtitles to search existing subtitles.')}</p>:
    busy==='search'?<p className="cast-help"><span className="spinner"/> {t('Searching subtitles…')}</p>:
    results&&results.length?<ul className="sub-results">{results.slice(0,12).map(s=><li key={s.id}><button disabled={!!busy} onClick={()=>useOnline(s)}><span className="lang-tag">{subLangName(s.language)}</span><span className="sub-rel">{s.release||s.source}</span>{s.hi&&<small title={t('For the deaf and hard of hearing')}>SDH</small>}{busy===s.id&&<span className="spinner"/>}</button></li>)}</ul>:
    results?<p className="cast-help">{t('No subtitles found online for this video.')}</p>:<button onClick={searchOnline}>{t('Search online')}</button>}
  </section>
  {aiSupported()&&<section><b><Icon name="sparkles" inline/>{t('Written by AI on this PC')}</b>
   {ai.state==='off'?<><p className="cast-help">{t('Works for every video, even without any subtitles: the AI listens and writes the lines a little ahead, then they are translated into your language. Uses the processor; the first time, about 150 MB are downloaded.')}</p><button className="primary" onClick={startAi}>{t('Generate subtitles')}</button></>:
    ai.state==='preparing'?<p className="cast-help"><span className="spinner"/> {t('Installing the AI ({what})… {p}%',{what:stepName(ai.step),p:Math.round((ai.p||0)*100)})}</p>:
    <><p className="cast-help">{ai.lines?t('{n} lines written so far. They appear a little ahead of playback.',{n:ai.lines}):t('Listening to the first 30 seconds…')}</p><button className="removebtn" onClick={stopAi}>{t('Stop the AI subtitles')}</button></>}
   {ai.error&&<p className="wp-error">{ai.error}</p>}
  </section>}
  {error&&<p className="wp-error">{error}</p>}
 </div>:null
 return{button,panel}
}

// Settings › Subtitles
export function SubtitleSettings(){
 const[key,setKey]=useState(wyzieKey()),[saved,setSaved]=useState(false),[,bump]=useState(0)
 const flag=(k:string,def:boolean)=>lsGet(k)==null?def:lsGet(k)==='1'
 const set=(k:string,v:boolean)=>{lsSet(k,v?'1':'0');bump(x=>x+1)}
 return <section className="panel settings-block sub-settings"><h2>{t('Subtitles')}</h2>
  <p className="settingsnote">{aiSupported()?t('In the player, 💬 Subtitles finds subtitles for any video: online for films and series, or written by AI on this PC.'):t('In the player, 💬 Subtitles finds subtitles online for films and series.')}</p>
  <SubLangPicker/>
  <h3>{t('Online subtitles (Wyzie Subs)')}</h3>
  <p className="settingsnote">{t('Free key, once: open sub.wyzie.io/redeem, get your key and paste it here. 1,000 searches a day.')} <a href="https://sub.wyzie.io/redeem" target="_blank" rel="noreferrer">sub.wyzie.io/redeem</a></p>
  <div className="pf-add"><input value={key} onChange={e=>{setKey(e.target.value.trim());setSaved(false)}} placeholder={t('Wyzie Subs key')} aria-label={t('Wyzie Subs key')}/><button className="primary" onClick={()=>{lsSet('wyzieKey',key);setSaved(true)}}>{saved?'✓ '+t('Saved'):t('Save')}</button></div>
  <label className="settings-check"><input type="checkbox" checked={flag('subAutoOnline',true)} onChange={e=>set('subAutoOnline',e.target.checked)}/> {t('When a film or episode has no subtitles, add the best ones found online by itself')}</label>
  {aiSupported()&&<>
  <h3>{t('Subtitles written by AI')}</h3>
  <label className="settings-check"><input type="checkbox" checked={flag('aiSubAuto',false)} onChange={e=>set('aiSubAuto',e.target.checked)}/> {t('When nothing is found, let the AI write them by itself')}</label>
  <label className="settings-check"><input type="checkbox" checked={flag('aiSubTranslate',true)} onChange={e=>set('aiSubTranslate',e.target.checked)}/> {t('Translate the AI subtitles into the app language')}</label>
  <div className="rs-seg" role="group" aria-label={t('AI quality')}><span>{t('AI quality')}</span>{([['base',t('Fast (150 MB)')],['small',t('More accurate (470 MB, slower)')]] as const).map(([v,l])=><button key={v} className={(lsGet('aiSubSize')==='small'?'small':'base')===v?'on':''} onClick={()=>{lsSet('aiSubSize',v);bump(x=>x+1)}}>{l}</button>)}</div>
  </>}
 </section>
}
