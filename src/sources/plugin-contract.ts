export type LNNovelItem={name:string;path:string;cover?:string}
export type LNChapterItem={name:string;path:string;releaseTime?:string;chapterNumber?:number;page?:string}
export type LNSourceNovel=LNNovelItem&{author?:string;artist?:string;genres?:string;summary?:string;status?:string|number;rating?:number;chapters?:LNChapterItem[];totalPages?:number}

export interface LNReaderPluginContract{
 id:string;name:string;site?:string;version?:string;icon?:string
 searchNovels(searchTerm:string,pageNo:number):Promise<LNNovelItem[]>
 parseNovel(novelPath:string):Promise<LNSourceNovel>
 parseChapter(chapterPath:string):Promise<string>
 parsePage?(novelPath:string,page:string):Promise<{chapters:LNChapterItem[]}>
 resolveUrl?(path:string,isNovel?:boolean):string
}
