// Watch party: the maths of staying together (no dependency, tested in tests/unit).
// - ClockSync: each guest works out the gap between its clock and the host's from the
//   round trips of the small "ping" messages (the quickest round trips are the most exact).
// - posNow: where the group's video is now, from a position that carries its time.
// - driftFix: how a player that is a little early or late comes back: a slightly
//   different speed for a few seconds, or a jump when it is far off.
// - describeChange: what someone did (play, pause, jump, another episode, speed).
// - opusMusic: the sound of a film sent to someone (stereo, not a voice call).

export type SyncState={media?:{sourceId:string,url:string}|null,episodeUrl:string,playing:boolean,time:number,rate:number,at?:number,why?:string}
type Clock={hostNow?:number|null,recvAt:number,now:number}

export class ClockSync{
 private samples:{rtt:number,offset:number,at:number}[]=[]
 /** One round trip: sent at `c` (this PC's clock, ms), the host's clock said `h`, the answer came back at `now`. */
 sample(c:number,h:number,now:number){
  const rtt=now-c
  if(!(rtt>=0)||rtt>10000||!Number.isFinite(h))return
  this.samples.push({rtt,offset:h+rtt/2-now,at:now})
  if(this.samples.length>12)this.samples.shift()}
 private best(now:number){const live=this.samples.filter(s=>now-s.at<120000);return live.length?live.reduce((a,b)=>b.rtt<a.rtt?b:a):null}
 /** True once the host answered at least one ping. */
 ready(now=Date.now()){return!!this.best(now)}
 /** Host's clock minus this PC's clock (ms). */
 offset(now=Date.now()){return this.best(now)?.offset??0}
 /** Round trip to the host (ms), or null when unknown. */
 rtt(now=Date.now()){const b=this.best(now);return b?Math.round(b.rtt):null}
 reset(){this.samples=[]}
}

/** Where the video of the group is now (seconds). With a position that carries its time
 * (`at`, on the host's clock) and a clock in step with the host it is exact; otherwise it is
 * guessed from when the message arrived, plus a quarter of a second of travel. */
export function posNow(s:SyncState,c:Clock):number{
 if(!s.playing)return s.time
 const rate=s.rate||1
 if(s.at!=null&&c.hostNow!=null)return s.time+Math.max(0,Math.min(c.hostNow-s.at,6*3600e3))/1000*rate
 return s.time+(Math.max(0,c.now-c.recvAt)/1000+0.25)*rate
}

export const DRIFT={ok:0.03,start:0.08,max:0.06,min:0.015,gain:0.3,hard:1}
/** What a player does about its gap with the group (gap = where it should be − where it is, in
 * seconds; positive = it is late). Small gaps are left alone; then the speed changes by a few
 * percent until the gap is closed (`correcting` = it was already doing so); a big gap is a jump. */
export function driftFix(gap:number,correcting:boolean,hard=DRIFT.hard):{jump:boolean,factor:number}{
 const a=Math.abs(gap)
 if(!Number.isFinite(gap))return{jump:false,factor:1}
 if(a>=hard)return{jump:true,factor:1}
 if(a<(correcting?DRIFT.ok:DRIFT.start))return{jump:false,factor:1}
 const f=Math.max(DRIFT.min,Math.min(DRIFT.max,a*DRIFT.gain))
 return{jump:false,factor:gap>0?1+f:1-f}
}

export const epKey=(s:{media?:{sourceId:string,url:string}|null,episodeUrl:string}|null|undefined)=>s&&s.media?s.media.sourceId+'|'+s.media.url+'|'+s.episodeUrl:''

export type Action=''|'play'|'pause'|'seek'|'episode'|'rate'
/** What changed between two positions of the group, for "Ali paused". Recent versions say it
 * themselves (`why`); for the others it is read from the difference. Regular position
 * reports and the pauses while someone's video loads are not actions. */
export function describeChange(prev:SyncState|null,next:SyncState,c:Clock):Action{
 const w=next.why
 if(w==='play'||w==='pause'||w==='seek'||w==='episode'||w==='rate')return w
 if(w)return''
 if(!prev||epKey(prev)!==epKey(next))return'episode'
 if(prev.playing!==next.playing)return next.playing?'play':'pause'
 if((prev.rate||1)!==(next.rate||1))return'rate'
 return Math.abs(next.time-posNow(prev,c))>2.5?'seek':''
}

/** 754 → "12:34", 3723 → "1:02:03". */
export function clockTime(sec:number):string{
 const s=Math.max(0,Math.floor(Number.isFinite(sec)?sec:0)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60
 return(h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(r).padStart(2,'0')
}

/** The sound of a film sent over a call: stereo and a higher bitrate (a call is tuned for one
 * voice by default). Applied to both descriptions of the call; other lines are left as they are. */
export function opusMusic(sdp:string,bitrate=160000):string{
 const lines=sdp.split('\r\n'),pts=new Set<string>()
 for(const l of lines){const m=/^a=rtpmap:(\d+) opus\//i.exec(l);if(m)pts.add(m[1])}
 if(!pts.size)return sdp
 const want:[string,string][]=[['stereo','1'],['sprop-stereo','1'],['maxaveragebitrate',String(bitrate)]]
 const seen=new Set<string>()
 const out=lines.map(l=>{const m=/^a=fmtp:(\d+) (.*)$/.exec(l);if(!m||!pts.has(m[1]))return l
  seen.add(m[1])
  const kv=m[2].split(';').map(x=>x.trim()).filter(Boolean).filter(x=>!want.some(([k])=>x.toLowerCase().startsWith(k+'=')))
  return'a=fmtp:'+m[1]+' '+[...kv,...want.map(([k,v])=>k+'='+v)].join(';')})
 // An opus line without parameters yet: they are added right after it.
 for(const pt of pts)if(!seen.has(pt)){const i=out.findIndex(l=>new RegExp('^a=rtpmap:'+pt+' opus/','i').test(l));if(i>=0)out.splice(i+1,0,'a=fmtp:'+pt+' '+want.map(([k,v])=>k+'='+v).join(';'))}
 return out.join('\r\n')
}

/** A colour that stays the same for a name (member chips and avatars). */
export function nameHue(name:string):number{let h=0;for(const ch of String(name||''))h=(h*31+ch.codePointAt(0)!)%360;return h}
