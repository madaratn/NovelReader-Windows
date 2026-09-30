export {}
declare global{interface Window{novelReader:{searchPlugin:(plugin:any,query:string)=>Promise<any[]>;parseNovel:(plugin:any,path:string)=>Promise<any>;miwayomiStatus:()=>Promise<any>;miwayomiFetch:(path:string,method?:string,body?:any)=>Promise<any>;parseChapter:(plugin:any,path:string)=>Promise<any>}}}
