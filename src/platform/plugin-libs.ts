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
