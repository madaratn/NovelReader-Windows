const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('novelReader',{
 searchPlugin:(plugin,query)=>ipcRenderer.invoke('plugin:search',{plugin,query}),
 parseNovel:(plugin,path)=>ipcRenderer.invoke('plugin:parseNovel',{plugin,path}),
 parseChapter:(plugin,path)=>ipcRenderer.invoke('plugin:parseChapter',{plugin,path})
})
