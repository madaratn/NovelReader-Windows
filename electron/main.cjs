const {app,BrowserWindow,ipcMain}=require('electron')
const path=require('path')
const runner=require('./plugin-runner.cjs')
function createWindow(){const win=new BrowserWindow({width:1280,height:820,minWidth:900,minHeight:600,backgroundColor:'#0b0c10',title:'Novel Reader',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});if(!app.isPackaged)win.loadURL('http://127.0.0.1:5173');else win.loadFile(path.join(app.getAppPath(),'dist','index.html'));win.webContents.on('did-fail-load',(_e,code,desc,url)=>console.error('Load failed',code,desc,url))}
ipcMain.handle('plugin:search',async(_e,{plugin,query})=>runner.search(plugin,query))
ipcMain.handle('plugin:parseNovel',async(_e,{plugin,path})=>runner.parseNovel(plugin,path))
ipcMain.handle('plugin:parseChapter',async(_e,{plugin,path})=>runner.parseChapter(plugin,path))
app.whenReady().then(createWindow)
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()})
