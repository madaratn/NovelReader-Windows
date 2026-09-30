const {contextBridge,ipcRenderer}=require('electron')
contextBridge.exposeInMainWorld('novelReader',{
 searchPlugin:(plugin,query)=>ipcRenderer.invoke('plugin:search',{plugin,query}),
 parseNovel:(plugin,path)=>ipcRenderer.invoke('plugin:parseNovel',{plugin,path}),
 parseChapter:(plugin,path)=>ipcRenderer.invoke('plugin:parseChapter',{plugin,path}),
 miwayomiStatus:()=>ipcRenderer.invoke('anime:miwayomiStatus'),miwayomiDebug:()=>ipcRenderer.invoke('anime:miwayomiDebug'),
 miwayomiFetch:(path,method='GET',body)=>ipcRenderer.invoke('anime:miwayomiFetch',{path,method,body}),
 localFolders:()=>ipcRenderer.invoke('local:folders'),
 localAddFolder:()=>ipcRenderer.invoke('local:addFolder'),
 localRemoveFolder:(folder)=>ipcRenderer.invoke('local:removeFolder',folder),
 localListVideos:()=>ipcRenderer.invoke('local:listVideos')
})
