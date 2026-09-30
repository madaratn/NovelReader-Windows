const vm=require('node:vm')
const cheerio=require('cheerio')
const dayjs=require('dayjs')
const htmlparser2=require('htmlparser2')
const urlencode=require('urlencode')

async function fetchApi(url,init={}){return fetch(url,{...init,headers:{'User-Agent':'Mozilla/5.0 NovelReader/0.2','Accept':'*/*','Accept-Language':'*',...(init.headers||{})}})}
async function fetchText(url,init,encoding){try{const r=await fetchApi(url,init);if(!r.ok)return '';const b=Buffer.from(await r.arrayBuffer());return new TextDecoder(encoding||'utf-8').decode(b)}catch{return ''}}
function runtimeRequire(name){
 if(name==='cheerio')return cheerio;if(name==='dayjs')return dayjs;if(name==='htmlparser2')return htmlparser2;if(name==='urlencode')return urlencode;
 if(name==='@libs/fetch')return{fetchApi,fetchText,fetchProto:async()=>{throw Error('fetchProto unsupported')}};
 if(name==='@libs/defaultCover')return{defaultCover:''};if(name==='@libs/novelStatus')return{NovelStatus:{Unknown:0,Ongoing:1,Completed:2,Licensed:3,PublishingFinished:4,Cancelled:5,OnHiatus:6}};
 if(name==='@libs/filterInputs')return{Filters:{}};if(name==='@libs/isAbsoluteUrl')return{isUrlAbsolute:u=>/^https?:\/\//i.test(u)};
 if(name==='@libs/storage')return{storage:{getItem:async()=>null,setItem:async()=>{}},localStorage:{getItem:()=>null,setItem:()=>{}},sessionStorage:{getItem:()=>null,setItem:()=>{}}};
 if(name==='@/types/plugin')return{Plugin:{}};throw Error('Unsupported plugin dependency: '+name)
}
async function loadPlugin(url){const r=await fetch(url);if(!r.ok)throw Error('Plugin download HTTP '+r.status);const code=await r.text();const module={exports:{}};const sandbox={module,exports:module.exports,require:runtimeRequire,console,URL,URLSearchParams,TextEncoder,TextDecoder,Headers,FormData,setTimeout,clearTimeout,atob,btoa};vm.createContext(sandbox);new vm.Script(code,{filename:'lnreader-plugin.js',timeout:2000}).runInContext(sandbox,{timeout:2000});return module.exports.default||module.exports}
async function search(plugin,query){const p=await loadPlugin(plugin.url);if(!p||typeof p.searchNovels!=='function')throw Error('searchNovels unavailable');const results=await Promise.race([p.searchNovels(query,1),new Promise((_,rej)=>setTimeout(()=>rej(Error('Search timeout')),12000))]);return (results||[]).map(x=>({name:x.name,path:x.path,cover:x.cover,sourceId:plugin.id,sourceName:plugin.name,lang:plugin.lang}))}
async function parseNovel(plugin,path){const p=await loadPlugin(plugin.url);return p.parseNovel(path)}
async function parseChapter(plugin,path){const p=await loadPlugin(plugin.url);if(!p||typeof p.parseChapter!=='function')throw Error('parseChapter unavailable');return Promise.race([p.parseChapter(path),new Promise((_,rej)=>setTimeout(()=>rej(Error('Chapter timeout')),15000))])}
module.exports={search,parseNovel,parseChapter}
