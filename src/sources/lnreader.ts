import type { NovelSource, SearchResult, Chapter } from './registry'

export type LNManifestPlugin = {
  id:string; name:string; lang?:string; language?:string; version?:string;
  iconUrl?:string; sourceUrl?:string; fileUrl?:string; url?:string;
}
export type LNManifest = LNManifestPlugin[] | { plugins?:LNManifestPlugin[] }

export function normalizeManifest(raw:LNManifest):LNManifestPlugin[]{
  if(Array.isArray(raw)) return raw
  return Array.isArray(raw.plugins) ? raw.plugins : []
}

export class LNReaderManifestSource implements NovelSource {
  id='lnreader-manifest'
  name='LNReader Repository'
  language='multi'
  description='LNReader-compatible plugin repository metadata'
  enabled=true
  constructor(public manifestUrl:string){}
  async loadManifest(){
    const res=await fetch(this.manifestUrl)
    if(!res.ok) throw new Error('Manifest HTTP '+res.status)
    return normalizeManifest(await res.json())
  }
  async search(query:string):Promise<SearchResult[]>{
    // Manifest discovery only. Actual plugin execution is intentionally delegated
    // to the isolated Electron host added in the next milestone.
    const q=query.toLowerCase()
    const plugins=await this.loadManifest()
    return plugins.filter(p=>p.name.toLowerCase().includes(q)).map(p=>({
      sourceId:'lnrepo:'+p.id, sourceName:p.name, title:'Source: '+p.name,
      author:p.language||p.lang||'unknown', url:p.sourceUrl||p.fileUrl||p.url||''
    }))
  }
  async getChapters(_novelUrl:string):Promise<Chapter[]>{return []}
  async getChapterContent(_chapterUrl:string):Promise<string>{return ''}
}

export const officialLNReaderManifest =
  'https://raw.githubusercontent.com/lnreader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json'
