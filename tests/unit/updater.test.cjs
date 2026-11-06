const test=require('node:test')
const assert=require('node:assert')
const Module=require('module')

test('updates: silent install on click, on idle only when nothing plays and the option is on',async()=>{
 const installs=[],handlers={}
 const fake={autoUpdater:{on(){},checkForUpdates:async()=>{},quitAndInstall:(silent,run)=>installs.push([silent,run])}}
 const orig=Module._load;Module._load=function(req,...a){return req==='electron-updater'?fake:orig.call(this,req,...a)}
 const {createUpdater}=require('../../electron/app-shell.cjs')
 let idle=0
 const u=createUpdater({app:{isPackaged:true,getVersion:()=>'0.9.0'},ipcMain:{handle:(n,f)=>{handlers[n]=f}},getWindow:()=>null,powerMonitor:{getSystemIdleTime:()=>idle},log:{info(){},warn(){}}})
 Module._load=orig
 assert.equal(fake.autoUpdater.autoInstallOnAppQuit,true)
 const tick=()=>new Promise(r=>setImmediate(r))
 assert.equal(u.idleTick(),false) // nothing downloaded yet
 u._set({state:'ready',next:'0.9.1'})
 idle=60;assert.equal(u.idleTick(),false) // PC in use
 idle=20*60;handlers['update:busy'](null,{busy:true,auto:true});assert.equal(u.idleTick(),false) // a video plays
 handlers['update:busy'](null,{busy:false,auto:false});assert.equal(u.idleTick(),false) // option off
 handlers['update:busy'](null,{busy:false,auto:true});assert.equal(u.idleTick(),true)
 await tick();assert.deepEqual(installs,[[true,true]]) // silent, reopens
 assert.equal(u.install(),false) // only once
})
