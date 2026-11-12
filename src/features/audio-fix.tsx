// Videos with no sound because their audio is in a format the built-in player
// cannot decode (AC3 / E-AC3 / DTS / TrueHD, common in big "remux" files).
// Detected while playing (frames decoded, no audio decoded), then the sound is
// converted on the fly by ffmpeg (electron/audio-fix.cjs) and played in step with
// the video by a hidden <audio>. The player's own volume button is greyed out for
// such files, so a volume slider is shown with the note.
import React,{useEffect,useRef,useState}from'react'
import{t}from'../i18n'
import{lsGet,lsSet}from'../lib/util'
import{Icon}from'../ui/common'

type Stream={index:number,lang:string,codec:string,channels:string,title:string,default:boolean}
const nr=()=>window.novelReader as any
const LANG3:Record<string,string>={fr:'fre|fra',en:'eng',es:'spa',de:'ger|deu',it:'ita',pt:'por',ja:'jpn',ko:'kor',ar:'ara',hi:'hin'}
// Track in the viewer's language (or the last one chosen), else the default one.
export function pickStream(list:Stream[],prefer=lsGet('audioFixLang')||'',langs:string[]=(navigator.languages||[navigator.language]) as string[]){
 if(!list.length)return -1
 if(prefer){const i=list.findIndex(s=>s.lang===prefer||s.title.toLowerCase()===prefer.toLowerCase());if(i>=0)return i}
 for(const l of langs){const code=String(l||'').slice(0,2).toLowerCase(),re=new RegExp('^('+(LANG3[code]||code)+')$');const i=list.findIndex(s=>re.test(s.lang));if(i>=0)return i}
 const d=list.findIndex(s=>s.default);return d>=0?d:0
}
export const silentNow=(v:HTMLVideoElement)=>{const a=(v as any).webkitAudioDecodedByteCount,vd=(v as any).webkitVideoDecodedByteCount;return(window as any).__forceSilent===true||(typeof a==='number'&&typeof vd==='number'&&vd>0&&a===0)}

export function useAudioFix(ref:React.RefObject<HTMLVideoElement|null>,streamUrl:string){
 const[state,setState]=useState<'off'|'loading'|'on'|'none'|'error'>('off'),[progress,setProgress]=useState(0),[streams,setStreams]=useState<Stream[]>([]),[track,setTrack]=useState(0),[error,setError]=useState('')
 const audio=useRef<HTMLAudioElement|null>(null),base=useRef(''),offset=useRef(0),lat=useRef(3),startedAt=useRef(0)
 const supported=typeof nr()?.audioFixStart==='function'&&/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(streamUrl)
 // New video: everything off.
 useEffect(()=>{setState('off');setStreams([]);setError('');stopAudio()},[streamUrl])
 useEffect(()=>()=>{stopAudio();nr()?.audioFixStop?.().catch(()=>{})},[])
 function stopAudio(){const a=audio.current;if(a){a.pause();a.removeAttribute('src');a.load();a.remove()}audio.current=null}
 // Detection: 4 s of playback with pictures but no decoded sound.
 useEffect(()=>{const v=ref.current;if(!v||!supported||state!=='off')return
  let watched=0,last=-1
  const tick=()=>{if(v.paused||v.seeking||v.readyState<3){last=-1;return}if(last>=0&&v.currentTime>last)watched+=v.currentTime-last;last=v.currentTime
   if(watched>=4){if(silentNow(v))begin();else clearInterval(iv)}}
  const iv=setInterval(tick,500);return()=>clearInterval(iv)},[streamUrl,state,supported])
 async function begin(){
  setState('loading');setProgress(0)
  const off=nr().onAudioFixProgress?.((p:number)=>setProgress(p))
  try{const r=await nr().audioFixStart(streamUrl);base.current=r.base;setStreams(r.streams||[])
   if(!r.streams?.length){setState('none');return}
   const i=pickStream(r.streams);setTrack(i);setState('on');restart(i)}
  catch(e:any){setError(String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,''));setState('error')}
  finally{off?.()}
 }
 // Start the converted sound a little ahead of the picture (ffmpeg needs a moment).
 function restart(i=track){const v=ref.current;if(!v||!base.current)return
  stopAudio();const a=document.createElement('audio');a.className='audio-fix';a.preload='auto';a.style.display='none';document.body.appendChild(a);audio.current=a
  const from=Math.max(0,v.currentTime+(v.paused?0:lat.current));offset.current=from;startedAt.current=Date.now()
  a.src=base.current+'?src='+encodeURIComponent(streamUrl)+'&t='+from.toFixed(2)+'&track='+i
  a.volume=v.volume;a.muted=v.muted
  a.addEventListener('canplay',()=>{const took=(Date.now()-startedAt.current)/1000;lat.current=Math.min(12,Math.max(1.5,took+1))},{once:true})
 }
 // Keep the sound on the picture: pause/play together, small drifts by speed, big ones by restarting.
 useEffect(()=>{const v=ref.current;if(!v||state!=='on')return
  let seekT:any=null
  const onSeek=()=>{clearTimeout(seekT);seekT=setTimeout(()=>restart(),250)}
  const onVol=()=>{const a=audio.current;if(a){a.volume=v.volume;a.muted=v.muted}}
  v.addEventListener('seeked',onSeek);v.addEventListener('volumechange',onVol)
  const iv=setInterval(()=>{const a=audio.current;if(!a)return
   const stalled=v.paused||v.seeking||v.readyState<3||v.ended
   const want=v.currentTime-offset.current
   if(stalled||want<0||a.readyState<3){if(!a.paused)a.pause();return}
   const drift=a.currentTime-want
   if(Math.abs(drift)>1.2){if(Date.now()-startedAt.current>4000)restart();return}
   a.playbackRate=v.playbackRate*(Math.abs(drift)<0.04?1:1-Math.max(-0.08,Math.min(0.08,drift*0.25)))
   if(a.paused)a.play().catch(()=>{})
  },250)
  return()=>{clearInterval(iv);clearTimeout(seekT);v.removeEventListener('seeked',onSeek);v.removeEventListener('volumechange',onVol)}},[state,streamUrl])
 const choose=(i:number)=>{setTrack(i);const s=streams[i];if(s)lsSet('audioFixLang',s.lang||s.title);restart(i)}
 const label=(s:Stream)=>[s.title,s.lang&&s.lang.toUpperCase(),s.codec.toUpperCase(),s.channels].filter(Boolean).join(' · ')
 const node=state==='off'?null:<div className={'audio-fix-note'+(state==='error'||state==='none'?' warn':'')} role="status">
  {state==='loading'&&<span><Icon name="volume" inline/>{progress>0&&progress<1?t('This video has a sound format the player cannot read (Dolby / DTS). Downloading the sound converter (once, about 30 MB)… {p}%',{p:Math.round(progress*100)}):t('This video has a sound format the player cannot read (Dolby / DTS). Converting the sound…')}</span>}
  {state==='on'&&<><span><Icon name="volume" inline/>{t('Sound converted live (the file uses Dolby / DTS sound).')}</span><label title={t('Volume')}><Icon name="volume" inline/><input type="range" min={0} max={1} step={0.05} defaultValue={ref.current?.volume??1} aria-label={t('Volume')} onChange={e=>{const v=ref.current;if(v){v.volume=Number(e.target.value);v.muted=false}}}/></label>{streams.length>1&&<label>{t('Sound track')}<select value={track} onChange={e=>choose(Number(e.target.value))}>{streams.map((s,i)=><option key={i} value={i}>{label(s)}</option>)}</select></label>}</>}
  {state==='none'&&<span><Icon name="mute" inline/>{t('This file has no sound track. Pick another quality.')}</span>}
  {state==='error'&&<span><Icon name="mute" inline/>{t('The sound of this file could not be converted: {e}. Pick another quality.',{e:error})}</span>}
 </div>
 return{node,state}
}
