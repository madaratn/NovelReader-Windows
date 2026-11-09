// "📺 Cast": send the video to a TV on the same Wi-Fi (electron/cast.cjs). While
// casting, the video on the PC stays paused and a remote control replaces it; the
// next episode goes to the same TV. Stopping resumes on the PC where the TV was.
import React,{useEffect,useRef,useState}from'react'
import{t}from'../i18n'
import{fmtTime}from'../lib/util'

const nr=()=>window.novelReader as any
type CastState={device:CastDevice,url:string,title:string}|null
let lastTime=0
// One cast at a time for the whole window (kept across episodes).
let current:CastState=null
const subs=new Set<()=>void>()
const setCurrent=(c:CastState)=>{current=c;for(const f of subs)f()}
export const castSupported=()=>typeof nr()?.castScan==='function'
export const castingNow=()=>!!current
const clean=(e:any)=>String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,'')

export function useCast(ref:React.RefObject<HTMLVideoElement|null>,video:any,title:string){
 const[cast,setCast]=useState<CastState>(current),[menu,setMenu]=useState(false),[devices,setDevices]=useState<CastDevice[]|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[st,setSt]=useState<{time:number,duration:number,playing:boolean}|null>(null),[diag,setDiag]=useState('')
 useEffect(()=>{const f=()=>setCast(current);subs.add(f);return()=>{subs.delete(f)}},[])
 const url=String(video?.streamUrl||'')
 const subtitles=(Array.isArray(video?.subtitleTracks)?video.subtitleTracks:[]).map((s:any)=>({url:String(s?.streamUrl||s?.url||s?.file||''),lang:String(s?.lang||s?.language||''),label:String(s?.label||s?.lang||'')})).filter((s:any)=>/^http:\/\/(127\.0\.0\.1|localhost):/.test(s.url)).slice(0,4)
 // The PC video stays paused while the TV plays.
 useEffect(()=>{const v=ref.current;if(!v)return;if(cast){v.dataset.casting='1';v.pause()}else delete v.dataset.casting
  const hold=()=>{if(current&&!v.paused)v.pause()};v.addEventListener('play',hold);return()=>v.removeEventListener('play',hold)},[cast,url])
 async function scan(){setDevices(null);setError('');setDiag('');try{const l=await nr().castScan();setDevices(l);if(!l.length&&typeof nr().castDiag==='function')setDiag(String(await nr().castDiag()||''))}catch(e){setError(clean(e));setDevices([])}}
 async function send(device:CastDevice,startAt:number){setBusy(device.id);setError('');try{const r=await nr().castStart({deviceId:device.id,url,title,startAt,subtitles});setCurrent({device:r.device,url,title});setMenu(false)}catch(e){setError(t('Could not cast to {name}: {e}',{name:device.name,e:clean(e)}))}finally{setBusy('')}}
 // Next episode (or another quality) while casting: same TV.
 // (The player may be a new one for the next episode: compare with what the TV plays.)
 useEffect(()=>{if(!current||!url||current.url===url)return;const same=current.title===title;send(current.device,same?lastTime:0)},[url])
 // TV position.
 useEffect(()=>{if(!cast)return;let alive=true;const tick=()=>nr().castStatus().then((s:any)=>{if(alive&&s){setSt(s);lastTime=Number(s.time)||0}}).catch(()=>{});tick();const iv=setInterval(tick,1000);return()=>{alive=false;clearInterval(iv)}},[cast])
 async function stop(){const at=st?.time||0;try{await nr().castStop()}catch{}setCurrent(null);setSt(null);const v=ref.current;if(v){delete v.dataset.casting;if(at>0)v.currentTime=at;v.play().catch(()=>{})}}
 const ctl=(a:'play'|'pause'|'seek'|'volume',x?:number)=>nr().castControl(a,x).catch((e:any)=>setError(clean(e)))
 if(!castSupported()||!url)return{button:null,panel:null}
 const button=<div className="cast-wrap"><button className={'cast-btn'+(cast?' on':'')} onClick={()=>{if(cast)return;setMenu(m=>!m);if(!menu)scan()}} title={t('Play on a TV on the same Wi-Fi')}>📺 {cast?t('On {name}',{name:cast.device.name}):t('Cast')}</button>
  {menu&&!cast&&<div className="cast-menu" role="dialog" aria-label={t('Cast to a TV')}>
   <b>{t('TVs on this Wi-Fi')}</b>
   {devices==null?<p className="cast-help"><span className="spinner"/> {t('Looking for TVs…')}</p>:devices.length===0?<><p className="cast-help">{document.documentElement.classList.contains('android')?t('No TV found. Check that the TV is on and on the same Wi-Fi as this phone.'):t('No TV found. Check that the TV is on and on the same Wi-Fi as this PC, and allow NovelReader on private networks if Windows asks.')}</p>{diag&&<p className="cast-diag"><small>{diag}</small></p>}</>:
    <ul>{devices.map(d=><li key={d.id}><button disabled={!!busy} onClick={()=>send(d,ref.current?.currentTime||0)}>{d.kind==='cast'?'📡':'📺'} {d.name}<small>{d.kind==='cast'?'Chromecast':'DLNA'}</small>{busy===d.id&&<span className="spinner"/>}</button></li>)}</ul>}
   <div className="cast-menu-foot"><button className="linkbtn" onClick={scan}>{t('Search again')}</button><button className="linkbtn" onClick={()=>setMenu(false)}>{t('Close')}</button></div>
   {error&&<p className="wp-error">{error}</p>}
  </div>}</div>
 const dur=st?.duration||ref.current?.duration||0
 const panel=cast?<div className="cast-panel" role="region" aria-label={t('Remote control')}>
  <div className="cast-title">📺 {t('Playing on {name}',{name:cast.device.name})}</div>
  <div className="cast-controls">
   <button onClick={()=>ctl('seek',Math.max(0,(st?.time||0)-10))} aria-label={t('Back 10 seconds')}>⏪ 10</button>
   <button className="primary" onClick={()=>ctl(st?.playing?'pause':'play')} aria-label={st?.playing?t('Pause'):t('Play')}>{st?.playing?'⏸':'▶'}</button>
   <button onClick={()=>ctl('seek',(st?.time||0)+10)} aria-label={t('Forward 10 seconds')}>10 ⏩</button>
  </div>
  <div className="cast-seek"><span>{fmtTime(st?.time||0)}</span><input type="range" min={0} max={Math.max(1,Math.floor(dur))} value={Math.floor(st?.time||0)} onChange={e=>{const x=Number(e.target.value);setSt(s=>s?{...s,time:x}:s);ctl('seek',x)}} aria-label={t('Position')}/><span>{dur?fmtTime(dur):'--:--'}</span></div>
  <label className="cast-vol">🔉<input type="range" min={0} max={1} step={0.05} defaultValue={0.6} onChange={e=>ctl('volume',Number(e.target.value))} aria-label={t('TV volume')}/></label>
  <button className="removebtn" onClick={stop}>{t('Stop casting (continue on the PC)')}</button>
  {error&&<p className="wp-error">{error}</p>}
 </div>:null
 return{button,panel}
}
