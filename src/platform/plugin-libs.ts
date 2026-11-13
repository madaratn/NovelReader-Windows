import {gcm} from '@noble/ciphers/aes'
// The "@libs/…" modules LNReader gives to its book sources (Android copy of
// electron/plugin-libs.cjs: keep both the same).
export const FilterTypes={TextInput:'Text',Picker:'Picker',CheckboxGroup:'Checkbox',Switch:'Switch',ExcludableCheckboxGroup:'XCheckbox'}
export const NovelStatus={Unknown:'Unknown',Ongoing:'Ongoing',Completed:'Completed',Licensed:'Licensed',PublishingFinished:'Publishing Finished',Cancelled:'Cancelled',OnHiatus:'On Hiatus',Inactive:'Inactive'}
export function makeStorage(){
 const m=new Map<string,{value:any,expires?:number}>()
 const live=(k:string)=>{const x=m.get(k);if(!x)return undefined;if(x.expires&&Date.now()>x.expires){m.delete(k);return undefined}return x}
 const storage={
  set:(key:string,value:any,expires?:any)=>{m.set(String(key),{value,expires:expires instanceof Date?expires.getTime():(typeof expires==='number'?expires:undefined)})},
  get:(key:string,raw?:boolean)=>{const x=live(String(key));return raw?x:x&&x.value},
  getAllKeys:()=>Array.from(m.keys()).filter(k=>live(k)),
  delete:(key:string)=>{m.delete(String(key))},
  clearAll:()=>m.clear(),
  getItem:async(key:string)=>{const x=live(String(key));return x?x.value:null},
  setItem:async(key:string,value:any)=>{m.set(String(key),{value})},
 }
 const web={get:()=>undefined,getItem:()=>null,setItem:()=>{}}
 return{storage,localStorage:web,sessionStorage:web}}

export const aes={gcm}
export const constants={NovelStatus:{...NovelStatus,STUB:'STUB'},defaultCover:''}
// Genre filter of an LNReader source (same as electron/plugin-libs.cjs).
export type GenreFilter={key:string,type:string,options:{label:string,value:any}[]}
export function genreFilter(filters:any):GenreFilter|null{
 let best:any=null
 for(const[key,f]of Object.entries<any>(filters||{})){
  if(!f||typeof f!=='object'||!Array.isArray(f.options)||f.options.length<3)continue
  const name=(key+' '+(f.label||'')).toLowerCase()
  if(!/genre|tag|categor|género|catégorie|kategorie|жанр/.test(name))continue
  if(!['Picker','Checkbox','XCheckbox'].includes(f.type))continue
  const options=f.options.map((o:any)=>({label:String(o.label??o.name??o.value??''),value:o.value??o.label})).filter((o:any)=>o.label&&o.value!==''&&o.value!=null&&!/^(all|any|tous|todos|none|-)$/i.test(o.label))
  if(options.length<3)continue
  const score=(/genre/.test(name)?2:0)+(f.type==='Picker'?0:1)
  if(!best||score>best.score)best={key,type:f.type,options,score}}
 return best&&{key:best.key,type:best.type,options:best.options}}
export function withGenre(filters:any,gf:GenreFilter|null,value:any){
 if(!gf||value==null||value==='')return filters
 const v=gf.type==='Picker'?value:gf.type==='Checkbox'?[value]:{include:[value],exclude:[]}
 return{...filters,[gf.key]:{type:gf.type,value:v}}}
