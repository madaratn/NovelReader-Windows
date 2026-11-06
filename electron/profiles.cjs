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
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,40)
const api={
 init,
 current:()=>state.current,
 list:()=>state.list.map(p=>({...p,current:p.id===state.current})),
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
