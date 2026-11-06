// AniList: sign-in (implicit OAuth in a small window that only shows anilist.co),
// then GraphQL calls with the token. The token stays in the main process, in the
// current profile's folder.
const fs=require('fs')
const path=require('path')
const API='https://graphql.anilist.co'
const PIN='https://anilist.co/api/v2/oauth/pin'

function createAniList({BrowserWindow,session,profiles,fetchImpl=globalThis.fetch}){
 const file=()=>profiles.dataPath('anilist.json')
 const read=()=>{try{return JSON.parse(fs.readFileSync(file(),'utf8'))||{}}catch{return{}}}
 const write=o=>{fs.mkdirSync(path.dirname(file()),{recursive:true});fs.writeFileSync(file(),JSON.stringify(o))}
 const authWindows=new Set()
 async function gql(query,variables,token=read().token){
  const r=await fetchImpl(API,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({query,variables:variables||{}})})
  const j=await r.json().catch(()=>({}))
  if(r.status===401||r.status===400&&/invalid token/i.test(JSON.stringify(j.errors||'')))throw new Error('AniList: session expired, sign in again')
  if(r.status===429)throw new Error('AniList: too many requests, try again in a minute')
  if(j.errors&&j.errors.length)throw new Error('AniList: '+j.errors.map(e=>e.message).join('; '))
  if(!r.ok)throw new Error('AniList HTTP '+r.status)
  return j.data
 }
 async function viewer(token){const d=await gql('query{Viewer{id name avatar{medium} siteUrl}}',{},token);return d&&d.Viewer}
 function status(){const s=read();return{clientId:s.clientId||'',connected:!!s.token,user:s.user||null,expiresAt:s.expiresAt||0}}
 async function setToken(token,expiresIn){const v=await viewer(token);const s=read();write({...s,token,user:{id:v.id,name:v.name,avatar:v.avatar&&v.avatar.medium,url:v.siteUrl},expiresAt:expiresIn?Date.now()+Number(expiresIn)*1000:0});return status()}
 // Opens anilist.co in a small window; the token comes back in the address (#access_token=…).
 function login(parent,clientId){
  const id=String(clientId||read().clientId||'').trim();if(!/^\d+$/.test(id))return Promise.reject(new Error('Enter your AniList client ID first'))
  write({...read(),clientId:id})
  return new Promise((resolve,reject)=>{
   const win=new BrowserWindow({width:520,height:720,parent:parent||undefined,modal:!!parent,title:'AniList',autoHideMenuBar:true,webPreferences:{partition:'anilist-login',contextIsolation:true,nodeIntegration:false,sandbox:true}})
   authWindows.add(win.webContents.id)
   let done=false
   const finish=(err,val)=>{if(done)return;done=true;authWindows.delete(win.webContents.id);if(!win.isDestroyed())win.close();err?reject(err):resolve(val)}
   const check=url=>{if(!String(url).startsWith(PIN))return false;const h=new URLSearchParams(String(url).split('#')[1]||'');const tok=h.get('access_token');if(tok)setToken(tok,h.get('expires_in')).then(s=>finish(null,s),e=>finish(e));else finish(new Error('AniList did not give a token. Check that the client redirect URL is '+PIN));return true}
   win.webContents.on('will-redirect',(_e,url)=>{check(url)})
   win.webContents.on('did-navigate',(_e,url)=>{check(url)})
   win.webContents.on('will-navigate',(e,url)=>{try{if(new URL(url).hostname!=='anilist.co')e.preventDefault()}catch{e.preventDefault()}})
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}))
   win.on('closed',()=>finish(new Error('Sign-in window closed')))
   win.loadURL('https://anilist.co/api/v2/oauth/authorize?client_id='+encodeURIComponent(id)+'&response_type=token')
  })
 }
 function logout(){const s=read();write({clientId:s.clientId||''});try{session.fromPartition('anilist-login').clearStorageData()}catch{}return status()}
 const isAuthWindow=wc=>authWindows.has(wc.id)
 // Only the queries the app needs (no arbitrary GraphQL from the page).
 const Q={
  search:'query($q:String,$type:MediaType){Page(perPage:6){media(search:$q,type:$type){id title{romaji english native} episodes chapters format seasonYear coverImage{medium} siteUrl}}}',
  entry:'query($id:Int){Media(id:$id){id episodes chapters title{romaji english} mediaListEntry{id status progress}}}',
  save:'mutation($mediaId:Int,$progress:Int,$status:MediaListStatus){SaveMediaListEntry(mediaId:$mediaId,progress:$progress,status:$status){id status progress}}',
  list:'query($userId:Int,$type:MediaType){MediaListCollection(userId:$userId,type:$type,status_in:[CURRENT,PLANNING,REPEATING,PAUSED]){lists{name entries{status progress media{id title{romaji english} episodes chapters format coverImage{medium} siteUrl}}}}}'
 }
 async function call(name,vars){
  if(!Q[name])throw new Error('Unknown AniList call')
  const s=read();if(name!=='search'&&!s.token)throw new Error('AniList: not signed in')
  if(name==='list')vars={...vars,userId:s.user&&s.user.id}
  return gql(Q[name],vars,s.token)
 }
 return{status,login,logout,setToken,call,isAuthWindow,gql}
}
module.exports={createAniList,PIN}
