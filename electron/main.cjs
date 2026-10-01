const {app,BrowserWindow,ipcMain,dialog,protocol,shell,screen,session}=require('electron')
const {Readable}=require('stream')
const {spawn}=require('child_process')
const fs=require('fs')
const path=require('path')
const runner=require('./plugin-runner.cjs')
const archive=require('./archive.cjs')
const {createTorrentManager}=require('./torrent-manager.cjs')
const {createBackupManager}=require('./backup.cjs')
const backups=createBackupManager({app,dialog,shell})
const SMOKE_TEST=process.env.NR_SMOKE_TEST==='1'
const {createWindowState,createUpdater}=require('./app-shell.cjs')
const {createOfflineStore}=require('./offline.cjs')
const {createLNReaderImporter}=require('./lnreader-import.cjs')
const {createFolderSync}=require('./sync.cjs')
const folderSync=createFolderSync({app,dialog})
const {createLocalTracks}=require('./local-tracks.cjs')
const localTracks=createLocalTracks()
// Lets the Local Videos player list and switch audio tracks (video.audioTracks).
app.commandLine.appendSwitch('enable-blink-features','AudioVideoTracks')
const offline=createOfflineStore({app})
const lnImporter=createLNReaderImporter({dialog})
const APP_ID='com.novelreader.windows'
let mainWindow=null
// One NovelReader at a time: a second launch focuses the existing window.
if(!SMOKE_TEST&&!app.requestSingleInstanceLock()){app.quit()}
app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus()}})
if(process.platform==='win32')app.setAppUserModelId(APP_ID) // required for Windows notifications
const updater=createUpdater({app,ipcMain,getWindow:()=>mainWindow})
ipcMain.handle('app:focus',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus()}return true})
function createWindow(){const ws=createWindowState({app,screen});const state=ws.load();const win=new BrowserWindow({...state,minWidth:900,minHeight:600,show:false,icon:path.join(__dirname,'icon.png'),backgroundColor:'#0b0c10',title:'NovelReader',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});if(!app.isPackaged&&!SMOKE_TEST)win.loadURL('http://127.0.0.1:5173');else win.loadFile(path.join(app.getAppPath(),'dist','index.html'));win.webContents.on('did-fail-load',(_e,code,desc,url)=>console.error('Load failed',code,desc,url));ws.track(win);win.once('ready-to-show',()=>{if(state.maximized)win.maximize();win.show()});setTimeout(()=>{if(!win.isDestroyed()&&!win.isVisible())win.show()},3000);mainWindow=win;win.on('closed',()=>{if(mainWindow===win)mainWindow=null});return win}
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


// ---- Local videos -------------------------------------------------------
// Files are served through a private nrlocal:// scheme, only from folders the
// user picked in a dialog. Range requests are supported so seeking works.
protocol.registerSchemesAsPrivileged([{scheme:'nrlocal',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}}])
const VIDEO_EXT=new Set(['.mp4','.m4v','.webm','.mkv','.mov','.ogv'])
const MIME={'.mp4':'video/mp4','.m4v':'video/mp4','.webm':'video/webm','.mkv':'video/x-matroska','.mov':'video/quicktime','.ogv':'video/ogg'}
function foldersFile(){return path.join(app.getPath('userData'),'local-video-folders.json')}
function loadFolders(){try{const x=JSON.parse(fs.readFileSync(foldersFile(),'utf8'));return Array.isArray(x)?x.filter(f=>typeof f==='string'):[]}catch{return []}}
function saveFolders(list){fs.mkdirSync(path.dirname(foldersFile()),{recursive:true});fs.writeFileSync(foldersFile(),JSON.stringify(list,null,2))}
function isInsideAllowed(file){const real=path.resolve(file);return loadFolders().some(root=>{const rel=path.relative(path.resolve(root),real);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel)})}
function scanVideos(root,limit=5000){const out=[];const walk=(dir,depth)=>{if(depth>6||out.length>=limit)return;let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
 for(const e of entries){if(e.name.startsWith('.'))continue;const full=path.join(dir,e.name);if(e.isDirectory())walk(full,depth+1);else if(e.isFile()&&VIDEO_EXT.has(path.extname(e.name).toLowerCase())){let size=0,mtime=0;try{const st=fs.statSync(full);size=st.size;mtime=st.mtimeMs}catch{}
  out.push({name:e.name,folder:root,relPath:path.relative(root,full),size,mtime,url:'nrlocal://media/?p='+encodeURIComponent(full)})}}};
 walk(root,0);return out.sort((a,b)=>a.relPath.localeCompare(b.relPath,undefined,{numeric:true,sensitivity:'base'}))}
ipcMain.handle('local:folders',async()=>loadFolders())
ipcMain.handle('local:addFolder',async e=>{const win=BrowserWindow.fromWebContents(e.sender);const r=await dialog.showOpenDialog(win,{title:'Choose a video folder',properties:['openDirectory']});if(r.canceled||!r.filePaths[0])return loadFolders();const list=loadFolders();if(!list.includes(r.filePaths[0]))list.push(r.filePaths[0]);saveFolders(list);return list})
ipcMain.handle('local:removeFolder',async(_e,folder)=>{const list=loadFolders().filter(f=>f!==folder);saveFolders(list);return list})
// Subtitles for a local video: files next to it and text tracks inside MKV files.
const localFileOf=url=>{let file='';try{file=new URL(String(url||'')).searchParams.get('p')||''}catch{};if(!file||!isInsideAllowed(file))throw new Error('This video is not in one of your folders.');return file}
const cleanLocal=fn=>async(_e,o)=>{try{return await fn(o||{})}catch(err){console.warn('[local tracks]',err);throw new Error(err&&err.message||String(err))}}
ipcMain.handle('local:tracks',cleanLocal(o=>localTracks.list(localFileOf(o.url))))
ipcMain.handle('local:subtitle',cleanLocal(o=>localTracks.subtitle(localFileOf(o.url),String(o.id||''))))
ipcMain.handle('local:listVideos',async()=>loadFolders().flatMap(f=>fs.existsSync(f)?scanVideos(f):[]))
function registerLocalProtocol(){
 protocol.handle('nrlocal',async req=>{
  try{
   const file=new URL(req.url).searchParams.get('p')||'';
   if(!file||!isInsideAllowed(file))return new Response('Forbidden',{status:403});
   const st=await fs.promises.stat(file);if(!st.isFile())return new Response('Not found',{status:404});
   const type=MIME[path.extname(file).toLowerCase()]||'application/octet-stream';
   const range=/bytes=(\d*)-(\d*)/.exec(req.headers.get('range')||'');
   if(range){let start=range[1]?Number(range[1]):0,end=range[2]?Number(range[2]):st.size-1;if(!range[1]&&range[2]){start=Math.max(0,st.size-Number(range[2]));end=st.size-1}
    end=Math.min(end,st.size-1);if(start>end||start>=st.size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+st.size}});
    return new Response(Readable.toWeb(fs.createReadStream(file,{start,end})),{status:206,headers:{'Content-Type':type,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${st.size}`,'Accept-Ranges':'bytes'}})}
   return new Response(Readable.toWeb(fs.createReadStream(file)),{status:200,headers:{'Content-Type':type,'Content-Length':String(st.size),'Accept-Ranges':'bytes'}})
  }catch(e){return new Response('Error: '+String(e&&e.message||e),{status:500})}
 })
}


// ---- Internet Archive + torrent streaming ---------------------------------
// Errors crossing IPC keep a short user-facing message; details go to the console.
let torrents=null
function getTorrents(){if(!torrents)torrents=createTorrentManager({cacheRoot:path.join(app.getPath('temp'),'novelreader-torrents'),log:(...a)=>console.warn('[torrent]',...a)});return torrents}
const cleanIpc=fn=>async(_e,arg)=>{try{return await fn(arg)}catch(e){if(e&&e.detail)console.warn('[archive/torrent]',e.message,e.detail);else console.warn('[archive/torrent]',e);throw new Error(e&&e.message||String(e))}}
ipcMain.handle('archive:search',cleanIpc(q=>archive.search(String(q||''))))
ipcMain.handle('archive:files',cleanIpc(id=>archive.files(String(id||''))))
ipcMain.handle('torrent:start',cleanIpc(o=>getTorrents().start({identifier:String(o&&o.identifier||''),fileName:o&&o.fileName!=null?String(o.fileName):undefined,magnet:o&&o.magnet!=null?String(o.magnet):undefined})))
ipcMain.handle('torrent:status',cleanIpc(id=>getTorrents().status(String(id||''))))
ipcMain.handle('torrent:stop',cleanIpc(async id=>{await getTorrents().stop(String(id||''));return true}))
// ---- Backup / restore ----------------------------------------------------------
const winOf=e=>BrowserWindow.fromWebContents(e.sender)
const cleanErr=fn=>async(e,arg)=>{try{return await fn(e,arg)}catch(err){console.warn('[backup]',err);throw new Error(err&&err.message||String(err))}}
ipcMain.handle('backup:export',cleanErr((e,payload)=>backups.exportBackup(winOf(e),payload)))
ipcMain.handle('backup:import',cleanErr(e=>backups.importBackup(winOf(e))))
ipcMain.handle('backup:auto',cleanErr((_e,o)=>backups.autoBackup(o&&o.payload,{force:!!(o&&o.force)})))
ipcMain.handle('backup:listAuto',cleanErr(()=>backups.listAuto()))
ipcMain.handle('backup:readAuto',cleanErr((_e,name)=>backups.readAuto(String(name||''))))
ipcMain.handle('backup:openFolder',cleanErr(()=>backups.openFolder()))
// ---- Offline chapters + LNReader import ------------------------------------------
const plainErr=fn=>async(e,arg)=>{try{return await fn(e,arg||{})}catch(err){console.warn('[offline/import]',err);throw new Error(err&&err.message||String(err))}}
ipcMain.handle('offline:save',plainErr((_e,o)=>offline.save(String(o.novelId||''),String(o.path||''),String(o.html||''),o.name)))
ipcMain.handle('offline:get',plainErr((_e,o)=>offline.get(String(o.novelId||''),String(o.path||''))))
ipcMain.handle('offline:list',plainErr((_e,o)=>offline.list(String(o.novelId||''))))
ipcMain.handle('offline:remove',plainErr((_e,o)=>offline.remove(String(o.novelId||''))))
ipcMain.handle('offline:usage',plainErr(()=>offline.usage()))
ipcMain.handle('offline:clear',plainErr(()=>offline.clearAll()))
ipcMain.handle('sync:status',plainErr(()=>folderSync.status()))
ipcMain.handle('sync:choose',plainErr(e=>folderSync.choose(BrowserWindow.fromWebContents(e.sender))))
ipcMain.handle('sync:read',plainErr(()=>folderSync.read()))
ipcMain.handle('sync:write',plainErr((_e,o)=>folderSync.write(o.data)))
ipcMain.handle('sync:disable',plainErr(()=>folderSync.disable()))
ipcMain.handle('lnreader:import',plainErr(e=>lnImporter.importBackup(BrowserWindow.fromWebContents(e.sender))))
// ---- Hardening ---------------------------------------------------------------------
// The window only ever shows the app itself. Links inside chapters open in the
// default browser instead of replacing the app; new windows, webviews and
// unexpected permissions are refused.
const DEV_ORIGIN='http://127.0.0.1:5173'
const isAppUrl=u=>{try{const x=new URL(u);return x.protocol==='file:'||(!app.isPackaged&&x.origin===DEV_ORIGIN)}catch{return false}}
const openOutside=u=>{try{const x=new URL(u);if((x.protocol==='https:'||x.protocol==='http:')&&!SMOKE_TEST)shell.openExternal(x.toString())}catch{}}
app.on('web-contents-created',(_e,contents)=>{
 contents.setWindowOpenHandler(({url})=>{openOutside(url);return{action:'deny'}})
 contents.on('will-navigate',(e,url)=>{if(!isAppUrl(url)){e.preventDefault();openOutside(url)}})
 contents.on('will-redirect',(e,url)=>{if(!isAppUrl(url))e.preventDefault()})
 contents.on('will-attach-webview',e=>e.preventDefault())
})
const ALLOWED_PERMISSIONS=new Set(['notifications','fullscreen','clipboard-sanitized-write'])
app.whenReady().then(()=>{
 session.defaultSession.setPermissionRequestHandler((_wc,permission,cb)=>cb(ALLOWED_PERMISSIONS.has(permission)))
 session.defaultSession.setPermissionCheckHandler((_wc,permission)=>ALLOWED_PERMISSIONS.has(permission))
})
let torrentsShutDown=false
app.on('before-quit',e=>{if(torrents&&!torrentsShutDown){e.preventDefault();torrentsShutDown=true;torrents.shutdown().catch(()=>{}).finally(()=>app.quit())}})

// NR_SMOKE_TEST=1: start Electron, check the preload bridge and (optionally)
// stream the first MiB of an Internet Archive torrent, then exit. Used in CI.
async function runSmokeTest(win){
 const result={}
 try{
  await new Promise(r=>win.webContents.once('did-finish-load',r))
  result.bridge=await win.webContents.executeJavaScript("['torrentStart','torrentStatus','torrentStop','archiveSearch','archiveFiles','backupExport','backupImport','backupAuto','backupListAuto','backupReadAuto','appVersion','updateCheck','onUpdateStatus','focusWindow','offlineSave','offlineGet','importLNReader','syncStatus','syncRead','syncWrite','localTracks','localSubtitle'].every(k=>typeof window.novelReader[k]==='function')")
  result.backup=await win.webContents.executeJavaScript("(async()=>{const p={app:'NovelReader',version:1,exportedAt:Date.now(),data:{library:JSON.stringify([{id:'x',name:'Smoke'}])}};const a=await window.novelReader.backupAuto(p);const b=await window.novelReader.backupAuto(p);const list=await window.novelReader.backupListAuto();const back=await window.novelReader.backupReadAuto(list[0].name);return {first:a.saved,second:b.saved,listed:list.length,novels:list[0].novels,same:back.data.library===p.data.library}})()")
  const id=process.env.NR_SMOKE_ARCHIVE_ID
  if(id){
   const info=await getTorrents().start({identifier:id})
   const r=await fetch(info.streamUrl,{headers:{Range:'bytes=0-1048575'}})
   const buf=Buffer.from(await r.arrayBuffer())
   result.stream={status:r.status,contentRange:r.headers.get('content-range'),bytes:buf.length,mp4:buf.slice(4,8).toString('latin1')==='ftyp',file:info.fileName}
   await getTorrents().stop(info.sessionId)
  }
  // Local Videos tracks on a real Chromium: embedded subtitles + audio track switching.
  const vdir=process.env.NR_SMOKE_VIDEO_DIR
  if(vdir){
   saveFolders([path.resolve(vdir)])
   result.tracks=await win.webContents.executeJavaScript(`(async()=>{const nr=window.novelReader;const v=(await nr.localListVideos()).find(x=>x.name==='tracks.mkv');const t=await nr.localTracks(v.url);const vtt=await nr.localSubtitle(v.url,t.subtitles[1].id);
    const el=document.createElement('video');el.muted=true;el.src=v.url;document.body.append(el);await new Promise((ok,ko)=>{el.onloadedmetadata=ok;el.onerror=()=>ko(new Error('video error '+(el.error&&el.error.code)))});
    const at=el.audioTracks;const n=at?at.length:0;if(n>1)at[1].enabled=true;const r={subs:t.subtitles.length,vtt:vtt.includes('Hello, world'),audio:n,labels:at?[...at].map(x=>x.label):[],switched:n>1&&at[1].enabled&&!at[0].enabled};el.remove();return r})()`)
  }
  result.security=await win.webContents.executeJavaScript("(async()=>{const csp=!!document.querySelector('meta[http-equiv=Content-Security-Policy]');const before=location.href;const w=window.open('https://example.com');try{location.href='https://example.com/'}catch{}await new Promise(r=>setTimeout(r,800));return{csp,popupBlocked:w===null,stayed:location.href===before}})()")
  result.ok=result.bridge===true&&result.security&&result.security.csp&&result.security.popupBlocked&&result.security.stayed&&result.backup&&result.backup.first===true&&result.backup.second===false&&result.backup.same===true&&(!id||(result.stream.status===206&&result.stream.bytes===1048576))&&(!vdir||(result.tracks.subs===2&&result.tracks.vtt&&result.tracks.audio===2&&result.tracks.switched))
 }catch(e){result.ok=false;result.error=String(e&&e.message||e)}
 console.log('SMOKE_RESULT '+JSON.stringify(result))
 if(torrents)await torrents.shutdown().catch(()=>{})
 app.exit(result.ok?0:1)
}

app.whenReady().then(()=>{registerLocalProtocol();if(SMOKE_TEST){runSmokeTest(createWindow());return}startMiwayomi();createWindow();updater.start()})
app.on('before-quit',()=>{if(miwayomiProcess){miwayomiProcess.kill();miwayomiProcess=null}})
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()})
