const {app,BrowserWindow,ipcMain}=require('electron')
const {spawn}=require('child_process')
const fs=require('fs')
const path=require('path')
const runner=require('./plugin-runner.cjs')
function createWindow(){const win=new BrowserWindow({width:1280,height:820,minWidth:900,minHeight:600,backgroundColor:'#0b0c10',title:'Novel Reader',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});if(!app.isPackaged)win.loadURL('http://127.0.0.1:5173');else win.loadFile(path.join(app.getAppPath(),'dist','index.html'));win.webContents.on('did-fail-load',(_e,code,desc,url)=>console.error('Load failed',code,desc,url))}
ipcMain.handle('plugin:search',async(_e,{plugin,query})=>runner.search(plugin,query))
ipcMain.handle('plugin:parseNovel',async(_e,{plugin,path})=>runner.parseNovel(plugin,path))
ipcMain.handle('plugin:parseChapter',async(_e,{plugin,path})=>runner.parseChapter(plugin,path))

const MIWAYOMI_BASE = process.env.MIWAYOMI_URL || 'http://127.0.0.1:4567';
let miwayomiProcess=null;
const miwayomiLogs=[];
function pushMiwayomiLog(kind,data){const lines=String(data||'').split(/\r?\n/).filter(Boolean);for(const line of lines){miwayomiLogs.push({time:new Date().toISOString(),kind,line});if(miwayomiLogs.length>500)miwayomiLogs.shift();console[kind==='stderr'?'error':'log']('[miwayomi]',line)}}
function engineRoot(){return app.isPackaged?path.join(process.resourcesPath,'engine'):path.join(app.getAppPath(),'engine')}
function startMiwayomi(){
 const root=engineRoot(), jar=path.join(root,'miwayomi-all.jar');
 const java=path.join(root,'jre','bin',process.platform==='win32'?'javaw.exe':'java');
 if(!fs.existsSync(jar)||!fs.existsSync(java)){console.warn('Bundled Anime engine not prepared. Run npm run prepare:anime-engine');return false}
 const data=path.join(app.getPath('userData'),'miwayomi'); fs.mkdirSync(data,{recursive:true});
 miwayomiLogs.length=0;
 miwayomiProcess=spawn(java,['-jar',jar,'--host','127.0.0.1','--port','4567','--no-open','--data',data],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 miwayomiProcess.stdout?.on('data',d=>pushMiwayomiLog('stdout',d));
 miwayomiProcess.stderr?.on('data',d=>pushMiwayomiLog('stderr',d));
 // Surface the runtime compatibility probe prominently in the Electron console.
 const runtimeProbeTimer=setTimeout(()=>{
   const probe=miwayomiLogs.filter(x=>x.line.includes('[novelreader] URLUtil')).map(x=>x.line);
   if(probe.length) console.log('[NovelReader Anime runtime probe]',probe.join(' | '));
   else console.warn('[NovelReader Anime runtime probe] URLUtil probe lines not seen yet');
 },2500);
 miwayomiProcess.once('exit',()=>clearTimeout(runtimeProbeTimer));
 miwayomiProcess.on('error',e=>pushMiwayomiLog('stderr','Process error: '+String(e.message||e)));
 miwayomiProcess.on('exit',(code,signal)=>{pushMiwayomiLog('stderr','Process exited code='+code+' signal='+signal);miwayomiProcess=null}); return true;
}
async function miwayomiRequest(pathname, init={}) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),8000);
  try {
    const r=await fetch(MIWAYOMI_BASE+pathname,{...init,signal:controller.signal,headers:{'Content-Type':'application/json',...(init.headers||{})}});
    const ct=r.headers.get('content-type')||'';
    if(!r.ok) {
      let detail='';
      try { detail=await r.text() } catch {}
      detail=String(detail||'').trim();
      if(detail.length>2000) detail=detail.slice(0,2000)+'…';
      throw new Error('Miwayomi HTTP '+r.status+(detail?' — '+detail:''));
    }
    return ct.includes('json')?await r.json():await r.text();
  } finally { clearTimeout(timer) }
}
ipcMain.handle('anime:miwayomiStatus', async()=>{try{const health=await miwayomiRequest('/api/v1/health');return {online:true,baseUrl:MIWAYOMI_BASE,health}}catch(e){if(!miwayomiProcess)startMiwayomi();return {online:false,starting:!!miwayomiProcess,baseUrl:MIWAYOMI_BASE,error:String(e.message||e)}}});
ipcMain.handle('anime:miwayomiDebug',async()=>{const [health,sources,installed]=await Promise.all([miwayomiRequest('/api/v1/health'),miwayomiRequest('/api/v1/sources'),miwayomiRequest('/api/v1/extensions/installed')]);return {health,sources,installed,dataDir:path.join(app.getPath('userData'),'miwayomi'),engineJar:path.join(engineRoot(),'miwayomi-all.jar'),logs:miwayomiLogs.slice(-250)}});
ipcMain.handle('anime:miwayomiFetch', async(_e,{path,method='GET',body})=>{
 if(typeof path!=='string'||!path.startsWith('/')) throw new Error('Invalid Miwayomi path');
 return miwayomiRequest(path,{method,body:body==null?undefined:JSON.stringify(body)});
});

app.whenReady().then(()=>{startMiwayomi();createWindow()})
app.on('before-quit',()=>{if(miwayomiProcess){miwayomiProcess.kill();miwayomiProcess=null}})
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()})
