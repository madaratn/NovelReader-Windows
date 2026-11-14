// Profiles: several people on one PC, each with their own libraries, progress,
// settings, backups and sync folder. Every profile gets its own browser storage
// (Electron session partition); the first profile keeps the original storage so
// nothing moves for existing users. Downloads, offline chapters and sources are
// shared by all profiles.
const fs=require('fs')
const path=require('path')
const crypto=require('crypto')

let appRef=null,state=null
const file=()=>path.join(appRef.getPath('userData'),'profiles.json')
function init(app){appRef=app;load();return api}
function load(){
 try{state=JSON.parse(fs.readFileSync(file(),'utf8'))}catch{state=null}
 if(!state||!Array.isArray(state.list)||!state.list.length)state={list:[{id:'default',name:'',color:'#8b7cff'}],current:'default'}
 if(!state.list.some(p=>p.id===state.current))state.current=state.list[0].id
 return state
}
function save(){fs.mkdirSync(path.dirname(file()),{recursive:true});fs.writeFileSync(file(),JSON.stringify(state,null,1))}
const COLORS=['#8b7cff','#3fb37f','#e08a2e','#d9545f','#2b9bd8','#c06bd8','#c9a43a']
const hashPin=(pin,salt)=>crypto.createHash('sha256').update(salt+':'+String(pin||'')).digest('hex')
let fails=0,until=0
// Is this the parent code? Five wrong codes in a row: wait 30 seconds.
function pinOk(pin){if(!state.pin)return true;if(Date.now()<until)throw new Error('Too many wrong codes. Try again in 30 seconds.');const a=Buffer.from(hashPin(pin,state.pin.salt)),b=Buffer.from(state.pin.hash);const ok=a.length===b.length&&crypto.timingSafeEqual(a,b);if(ok)fails=0;else if(++fails>=5){fails=0;until=Date.now()+30000}return ok}
const needPin=pin=>{if(!pinOk(pin))throw new Error('Wrong parent code')}
// Leaving or changing profiles from a kids profile asks for the parent code.
const guarded=()=>!!state.pin&&!!(state.list.find(p=>p.id===state.current)||{}).kids
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,40)
const api={
 init,
 // Modules that only receive `app` (sync, backups) get the profiles of that app.
 forApp(app){if(appRef!==app)init(app);return api},
 current:()=>state.current,
 list:()=>state.list.map(p=>({...p,current:p.id===state.current})),
 hasPin:()=>!!state.pin,
 checkPin:pin=>pinOk(pin),
 guarded,needPin,
 // {pin (current parent code), newPin ('' removes it), id + kids + genres}
 parental(o={}){needPin(o.pin)
  if(typeof o.newPin==='string'){if(o.newPin===''){delete state.pin;for(const p of state.list)p.kids=false}else{if(!/^\d{4,8}$/.test(o.newPin))throw new Error('The code is 4 to 8 digits');const salt=crypto.randomBytes(12).toString('hex');state.pin={salt,hash:hashPin(o.newPin,salt)}}}
  if(o.id){const p=state.list.find(x=>x.id===o.id);if(!p)throw new Error('Unknown profile');if(o.kids!==undefined){if(o.kids&&!state.pin)throw new Error('Set a parent code first');if(o.kids&&p.id==='default')throw new Error('The first profile cannot be a kids profile');p.kids=!!o.kids}if(Array.isArray(o.genres))p.genres=o.genres.map(String).slice(0,30)}
  save();return true},
 // Electron partition for a profile (undefined = the default session).
 partition:(id=state.current)=>id==='default'?undefined:'persist:profile-'+id,
 // Per-profile folder for main-process data (backups, sync settings).
 dataPath:(...parts)=>state.current==='default'?path.join(appRef.getPath('userData'),...parts):path.join(appRef.getPath('userData'),'profiles',state.current,...parts),
 create(name){const id=crypto.randomBytes(5).toString('hex');const p={id,name:clean(name)||'Profile '+(state.list.length+1),color:COLORS[state.list.length%COLORS.length]};state.list.push(p);save();return p},
 rename(id,name){const p=state.list.find(x=>x.id===id);if(!p)throw new Error('Unknown profile');p.name=clean(name);save();return p},
 setColor(id,color){const p=state.list.find(x=>x.id===id);if(p&&/^#[0-9a-f]{6}$/i.test(color)){p.color=color;save()}return p},
 select(id){if(!state.list.some(x=>x.id===id))throw new Error('Unknown profile');state.current=id;save();return id},
 // Removing a profile deletes its storage; the default and current ones cannot be removed.
 remove(id){if(id==='default')throw new Error('The first profile cannot be removed');if(id===state.current)throw new Error('Switch to another profile first');state.list=state.list.filter(x=>x.id!==id);save();try{fs.rmSync(path.join(appRef.getPath('userData'),'profiles',id),{recursive:true,force:true})}catch{}return true}
}
module.exports=api
