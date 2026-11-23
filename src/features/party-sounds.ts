// Watch party: the small sounds that say what happens without looking — someone comes
// in, someone leaves, a message arrives while the chat is closed, the countdown.
// Made on the spot (two short notes), quiet, and off with one option.
import{lsGet}from'../lib/util'

export const partySoundsOn=()=>lsGet('partySounds')!=='0'
let ctx:AudioContext|null=null
const NOTES:Record<string,[number,number][]>={
 join:[[523,0],[784,0.11]],      // up
 leave:[[659,0],[440,0.11]],     // down
 message:[[880,0]],
 tick:[[660,0]],
 go:[[880,0],[1175,0.09]]
}
export function partySound(kind:'join'|'leave'|'message'|'tick'|'go'){
 if(!partySoundsOn())return
 const w=window as any
 ;(w.__partySounds=w.__partySounds||[]).push(kind) // (what was played, for the tests)
 try{
  const AC=window.AudioContext||w.webkitAudioContext;if(!AC)return
  ctx=ctx||new AC();if(ctx!.state==='suspended')ctx!.resume().catch(()=>{})
  const c=ctx!,t0=c.currentTime+0.01
  for(const[freq,at]of NOTES[kind]){
   const o=c.createOscillator(),g=c.createGain()
   o.type='sine';o.frequency.value=freq
   g.gain.setValueAtTime(0,t0+at);g.gain.linearRampToValueAtTime(0.07,t0+at+0.015);g.gain.exponentialRampToValueAtTime(0.0001,t0+at+0.22)
   o.connect(g);g.connect(c.destination);o.start(t0+at);o.stop(t0+at+0.25)}
 }catch{}
}
