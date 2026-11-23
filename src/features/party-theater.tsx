// Watch party: the screen of someone who watches the stream of a friend (they have no
// video of their own for this episode). The picture and the sound come from the
// friend's player; play, pause and the position are asked to the group like from any
// player, and act on the friend's video. The party's layer (reactions, chat in full
// screen, who did what) sits on it like on the normal player.
import React,{useEffect,useRef,useState}from'react'
import{t}from'../i18n'
import{lsGet,lsSet}from'../lib/util'
import{Icon}from'../ui/common'
import{posNow,clockTime}from'../lib/party-sync'
import{party,useParty}from'./watch-party'

const savedVolume=()=>{const raw=lsGet('partyStreamVolume'),v=Number(raw);return raw!==null&&Number.isFinite(v)?Math.min(1,Math.max(0,v)):1}

export function PartyTheater(){
 const snap=useParty(),view=snap.view,on=!!view
 const vref=useRef<HTMLVideoElement>(null),stageRef=useRef<HTMLDivElement>(null)
 const[,tick]=useState(0),[muted,setMuted]=useState(false),[vol,setVol]=useState(savedVolume),[tap,setTap]=useState(false),[drag,setDrag]=useState<number|null>(null),[idle,setIdle]=useState(false),[size,setSize]=useState(''),[full,setFull]=useState(false),[pictures,setPictures]=useState(false)
 const stream=view?.stream||null
 // The picture and the sound. A browser may refuse sound before the first click: it starts silent and says so.
 useEffect(()=>{const v=vref.current;if(!v)return;if(v.srcObject!==stream)v.srcObject=stream;setPictures(false);if(!stream)return
  v.muted=muted;v.volume=vol
  v.play().catch(()=>{v.muted=true;setTap(true);v.play().catch(()=>{})})},[stream])
 useEffect(()=>{const v=vref.current;if(v){v.volume=vol;v.muted=muted||tap}},[vol,muted,tap])
 // The clock of the film (the group's position) moves by itself between two reports.
 useEffect(()=>{if(!on)return;const iv=setInterval(()=>tick(x=>x+1),500);return()=>clearInterval(iv)},[on])
 // A player of the app left running underneath would talk over the stream.
 useEffect(()=>{if(!on)return;for(const v of Array.from(document.querySelectorAll('.media-player-top video'))){const el=v as HTMLVideoElement;if(!el.paused)el.pause()}},[on])
 // How the picture arrives ("720p"), looked at now and then.
 useEffect(()=>{if(!stream){setSize('');return}let live=true;const look=async()=>{const s=await party.viewStats();if(live&&s)setSize(s.height?s.height+'p':'')};const iv=setInterval(look,3000);look();return()=>{live=false;clearInterval(iv)}},[stream])
 useEffect(()=>{const f=()=>setFull(!!stageRef.current&&document.fullscreenElement===stageRef.current);document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[])
 // The bars hide after 3 s without a move while the film plays.
 useEffect(()=>{if(!on)return;const el=stageRef.current;if(!el)return
  let timer=0
  const wake=()=>{setIdle(false);window.clearTimeout(timer);timer=window.setTimeout(()=>{if(party.snap.state?.playing&&party.snap.view?.state==='on'&&!el.querySelector(':focus-visible'))setIdle(true)},3000)}
  wake();const ev=['mousemove','pointerdown','keydown','touchstart'] as const
  ev.forEach(e=>el.addEventListener(e,wake,{passive:true}));return()=>{window.clearTimeout(timer);ev.forEach(e=>el.removeEventListener(e,wake))}},[on])
 const now=()=>{const s=party.snap.state;return s?posNow(s,{hostNow:party.hostNow(),recvAt:party.snap.stateAt,now:Date.now()}):0}
 // Ask the group (the friend's player follows, and so does the picture).
 const ask=(patch:{playing?:boolean,time?:number},why:string)=>{const s=party.snap.state;if(!s?.media)return;if(!party.canControl()){party.toast(t('Only the host controls the playback.'));return}
  party.share({media:s.media,episodeUrl:s.episodeUrl,episodeName:s.episodeName,episodeNumber:s.episodeNumber,playing:s.playing,time:now(),rate:s.rate,dur:s.dur,...patch,why})}
 const toggle=()=>{const s=party.snap.state;if(s)ask({playing:!s.playing},s.playing?'pause':'play')}
 const jump=(d:number)=>{const s=party.snap.state;if(!s)return;const max=s.dur&&Number.isFinite(s.dur)?s.dur-1:Infinity;ask({time:Math.max(0,Math.min(max,now()+d))},'seek')}
 const fullscreen=()=>{const el=stageRef.current;if(!el)return;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else el.requestFullscreen().catch(()=>{})}
 const close=()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});party.ownSources=true;party.unwatch()}
 // Keys, like on the player: space, arrows, F, M. They stop here: a player of the app
 // left open underneath must not take them for itself.
 useEffect(()=>{if(!on)return;const k=(e:KeyboardEvent)=>{const el=e.target as HTMLElement;if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT'||el.isContentEditable)||e.ctrlKey||e.metaKey||e.altKey)return
   const key=e.key.length===1?e.key.toLowerCase():e.key
   if(![' ','k','j','l','ArrowLeft','ArrowRight','f','m','n','p'].includes(key))return
   e.stopPropagation()
   if(key===' '&&el?.tagName==='BUTTON')return
   e.preventDefault()
   if(key===' '||key==='k')toggle()
   else if(key==='ArrowLeft'||key==='j')jump(-10)
   else if(key==='ArrowRight'||key==='l')jump(10)
   else if(key==='f')fullscreen()
   else if(key==='m'){setTap(false);setMuted(m=>!m)}}
  window.addEventListener('keydown',k,true);return()=>window.removeEventListener('keydown',k,true)},[on])
 // Whoever started a countdown from here starts the video at zero.
 useEffect(()=>{if(!on)return;return party.onMyCount(at=>{const s=party.snap.state;if(s?.playing)ask({playing:false},'pause');const ms=Math.max(0,at-(party.hostNow()??Date.now()));setTimeout(()=>{if(party.snap.view&&!party.snap.state?.playing)ask({playing:true},'play')},ms)})},[on])
 if(!view)return null
 const st=snap.state,name=snap.members.find(m=>m.id===view.id)?.name||t('Guest')
 const dur=st?.dur&&Number.isFinite(st.dur)&&st.dur>0?st.dur:0,pos=drag??Math.min(dur||Infinity,now()),can=party.canControl()&&!!st?.media
 const theirs=snap.presence[view.id],waiting=view.state==='on'&&(!pictures||(!!theirs&&!theirs.can))
 const title=st?.media?st.media.name+(st.episodeName&&st.media.kind!=='movie'?' · '+st.episodeName:''):''
 return <div className="party-theater" role="dialog" aria-label={t('Stream of {name}',{name})}>
  <div className={'pt-stage'+(idle?' idle':'')+(full?' full':'')} ref={stageRef}>
   <video className="pt-video" ref={vref} autoPlay playsInline onPlaying={()=>setPictures(true)} onLoadedData={()=>setPictures(true)}/>
   {snap.cue&&view.state==='on'&&<div className="pt-cue" aria-live="off">{snap.cue.split('\n').map((l,i)=><span key={i}>{l}</span>)}</div>}
   {(view.state!=='on'||waiting)&&<div className="pt-veil" role="status">
    {view.state==='error'?<><p>{view.error}</p><div className="pt-veil-actions"><button className="primary" onClick={()=>party.watch(view.id)}>{t('Try again')}</button><button onClick={close}>{t('Close')}</button></div></>
     :<><span className="spinner" aria-hidden="true"/><p>{view.state==='asking'?t('Connecting to the stream of {name}…',{name}):theirs&&!theirs.can?t('Waiting for the video of {name}…',{name}):t('The picture is coming…')}</p></>}
   </div>}
   {tap&&view.state==='on'&&<button className="pt-sound" onClick={()=>{setTap(false);setMuted(false);const v=vref.current;if(v){v.muted=false;v.play().catch(()=>{})}}}><Icon name="volume" inline/>{t('Turn the sound on')}</button>}
   <div className="pt-top">
    <div className="pt-title"><b>{title||t('Stream of {name}',{name})}</b><span className="pt-from"><Icon name="signal" inline/>{t('Stream of {name}',{name})}{size?' · '+size:''}</span></div>
    <button className="pt-close" onClick={close} aria-label={t('Close the stream')} title={t('Close the stream')}>×</button>
   </div>
   <div className="pt-bar">
    <button className="pt-btn" onClick={toggle} disabled={!can} aria-label={st?.playing?t('Pause'):t('Play')} title={can?(st?.playing?t('Pause'):t('Play')):t('Only the host controls the playback.')}><Icon name={st?.playing?'pause':'playsolid'}/></button>
    <span className="pt-time">{clockTime(pos)}</span>
    <input className="pt-seek" type="range" min={0} max={dur||1} step={1} value={Math.min(pos,dur||1)} disabled={!can||!dur} aria-label={t('Position in the video')}
     onChange={e=>setDrag(Number(e.target.value))} onPointerUp={()=>{if(drag!=null){ask({time:drag},'seek');setDrag(null)}}} onKeyUp={()=>{if(drag!=null){ask({time:drag},'seek');setDrag(null)}}} onBlur={()=>setDrag(null)}
     style={{'--pt-fill':(dur?Math.min(100,pos/dur*100):0)+'%'} as React.CSSProperties}/>
    <span className="pt-time">{dur?clockTime(dur):'--:--'}</span>
    <button className="pt-btn" onClick={()=>{setTap(false);setMuted(m=>!m)}} aria-label={muted||tap?t('Unmute'):t('Mute')} title={muted||tap?t('Unmute'):t('Mute')} aria-pressed={muted||tap}><Icon name={muted||tap||vol===0?'mute':'volume'}/></button>
    <input className="pt-vol" type="range" min={0} max={1} step={0.05} value={muted||tap?0:vol} aria-label={t('Volume')} onChange={e=>{const v=Number(e.target.value);setVol(v);lsSet('partyStreamVolume',String(v));setTap(false);setMuted(v===0)}} style={{'--pt-fill':((muted||tap?0:vol)*100)+'%'} as React.CSSProperties}/>
    <button className="pt-btn" onClick={fullscreen} aria-label={full?t('Exit fullscreen'):t('Fullscreen')} title={full?t('Exit fullscreen'):t('Fullscreen')}><Icon name={full?'minimize':'maximize'}/></button>
   </div>
  </div>
 </div>
}
