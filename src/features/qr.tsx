// QR code for the phone link: shown on the PC (PcShareSettings), scanned by the phone
// with its camera inside the app (QrScanner) — no link to type.
import React,{useEffect,useRef,useState}from'react'
import qrcode from'qrcode-generator'
import{t}from'../i18n'

/** The QR code of [text] as black / white cells (true = black). */
export function qrCells(text:string):boolean[][]{
 const q=qrcode(0,'M');q.addData(text);q.make();const n=q.getModuleCount()
 return Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>q.isDark(r,c)))}
export function QrCode({text,size=180,label}:{text:string,size?:number,label:string}){
 const cells=qrCells(text),n=cells.length,quiet=4,total=n+quiet*2
 let d='';cells.forEach((row,r)=>row.forEach((on,c)=>{if(on)d+='M'+(c+quiet)+' '+(r+quiet)+'h1v1h-1z'}))
 // Always black on white: cameras read it whatever the theme.
 return <svg className="qr" role="img" aria-label={label} width={size} height={size} viewBox={'0 0 '+total+' '+total} shapeRendering="crispEdges"><rect width={total} height={total} fill="#fff"/><path d={d} fill="#000"/></svg>}

/** Reads a QR code in a picture (RGBA pixels). */
export async function decodeQr(data:Uint8ClampedArray,width:number,height:number):Promise<string>{
 const{default:jsQR}=await import('jsqr');return jsQR(data,width,height,{inversionAttempts:'dontInvert'})?.data||''}

// Camera view that calls onText with what the QR code says; the caller closes it.
export function QrScanner({onText,onClose}:{onText:(text:string)=>void,onClose:()=>void}){
 const video=useRef<HTMLVideoElement>(null),[err,setErr]=useState('')
 useEffect(()=>{let stream:MediaStream|null=null,stop=false,timer=0
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!
  const tick=async()=>{const v=video.current;if(stop||!v)return
   if(v.videoWidth>0){const scale=Math.min(1,640/v.videoWidth);canvas.width=Math.round(v.videoWidth*scale);canvas.height=Math.round(v.videoHeight*scale)
    ctx.drawImage(v,0,0,canvas.width,canvas.height);const img=ctx.getImageData(0,0,canvas.width,canvas.height)
    const text=await decodeQr(img.data,img.width,img.height).catch(()=>'');if(text&&!stop){stop=true;onText(text);return}}
   timer=window.setTimeout(tick,250)}
  ;(async()=>{try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('no camera')
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})
   if(stop){stream.getTracks().forEach(x=>x.stop());return}
   const v=video.current!;v.srcObject=stream;await v.play().catch(()=>{});tick()
  }catch(e:any){setErr(/denied|NotAllowed|Permission/i.test(String(e?.name)+String(e?.message))?t('The camera is not allowed for NovelReader. Allow it in the phone settings, or type the link instead.'):t('The camera could not be opened. Type the link instead.'))}})()
  return()=>{stop=true;clearTimeout(timer);stream?.getTracks().forEach(x=>x.stop())}},[])
 return <div className="qs-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="qs qr-scan" role="dialog" aria-modal="true" aria-label={t('Scan the QR code')} tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape')onClose()}}>
  <h2>{t('Scan the QR code')}</h2>
  <p className="settings-help">{t('Point the camera at the QR code shown on the PC (Settings › Phone link).')}</p>
  {err?<div className="anime-toast error" role="alert"><span>{err}</span></div>:<video ref={video} playsInline muted/>}
  <div className="libraryactions"><button onClick={onClose} aria-label={t('Close')}>{t('Cancel')}</button></div>
 </div></div>}
