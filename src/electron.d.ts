export {}
declare global{interface Window{novelReader:{searchPlugin:(plugin:any,query:string)=>Promise<any[]>;parseNovel:(plugin:any,path:string)=>Promise<any>}}}
