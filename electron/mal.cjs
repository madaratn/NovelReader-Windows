// MyAnimeList: sign-in (OAuth with PKCE "plain", the only method MAL supports) in
// a small window that only shows myanimelist.net, then calls to the v2 API. The
// tokens stay in the main process, in the current profile's folder; the access
// token is refreshed with the refresh token when it expires.
const fs=require('fs')
const path=require('path')
const crypto=require('crypto')
const API='https://api.myanimelist.net/v2'
const AUTH='https://myanimelist.net/v1/oauth2/authorize'
const TOKEN='https://myanimelist.net/v1/oauth2/token'
// Must be the "App Redirect URL" of the user's MAL client. Never loaded: the
// sign-in window catches it and reads the code from it.
const REDIRECT='http://localhost/novelreader-mal'
const ALLOWED=/(^|\.)myanimelist\.net$/

function verifier(){return crypto.randomBytes(48).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'').slice(0,64)}

function createMAL({BrowserWindow,session,profiles,fetchImpl=globalThis.fetch}){
 const file=()=>profiles.dataPath('myanimelist.json')
 const read=()=>{try{return JSON.parse(fs.readFileSync(file(),'utf8'))||{}}catch{return{}}}
 const write=o=>{fs.mkdirSync(path.dirname(file()),{recursive:true});fs.writeFileSync(file(),JSON.stringify(o))}
 const authWindows=new Set()
 const clientAuth=s=>({client_id:s.clientId,...(s.clientSecret?{client_secret:s.clientSecret}:{})})
 async function tokenRequest(params){
  const r=await fetchImpl(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams(params).toString()})
  const j=await r.json().catch(()=>({}))
  if(!r.ok||!j.access_token)throw new Error('MyAnimeList: '+(j.message||j.hint||j.error||('HTTP '+r.status)))
  return j
 }
 function saveTokens(j,extra){const s=read();const next={...s,...extra,token:j.access_token,refresh:j.refresh_token||s.refresh||'',expiresAt:j.expires_in?Date.now()+Number(j.expires_in)*1000:0};write(next);return next}
 async function refresh(){
  const s=read();if(!s.refresh)throw new Error('MyAnimeList: session expired, sign in again')
  try{return saveTokens(await tokenRequest({...clientAuth(s),grant_type:'refresh_token',refresh_token:s.refresh}))}
  catch{write({clientId:s.clientId||'',clientSecret:s.clientSecret||''});throw new Error('MyAnimeList: session expired, sign in again')}
 }
 async function api(method,p,{query,form}={},retry=true){
  let s=read();if(!s.token)throw new Error('MyAnimeList: not signed in')
  if(s.expiresAt&&Date.now()>s.expiresAt-60e3)s=await refresh()
  const url=API+p+(query?'?'+new URLSearchParams(query).toString():'')
  const r=await fetchImpl(url,{method,headers:{Authorization:'Bearer '+s.token,Accept:'application/json',...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:form?new URLSearchParams(form).toString():undefined})
  if(r.status===401&&retry){await refresh();return api(method,p,{query,form},false)}
  const j=await r.json().catch(()=>({}))
  if(r.status===401)throw new Error('MyAnimeList: session expired, sign in again')
  if(r.status===429)throw new Error('MyAnimeList: too many requests, try again in a minute')
  if(r.status===404&&method==='DELETE')return{}
  if(!r.ok)throw new Error('MyAnimeList: '+(j.message||j.error||('HTTP '+r.status)))
  return j
 }
 function status(){const s=read();return{clientId:s.clientId||'',hasSecret:!!s.clientSecret,connected:!!s.token,user:s.user||null,expiresAt:s.expiresAt||0}}
 async function loadUser(){const u=await api('GET','/users/@me',{query:{fields:'anime_statistics'}});write({...read(),user:{id:u.id,name:u.name,avatar:u.picture||'',url:'https://myanimelist.net/profile/'+encodeURIComponent(u.name||'')}});return status()}
 async function exchange(code,codeVerifier){const s=read();saveTokens(await tokenRequest({...clientAuth(s),grant_type:'authorization_code',code,code_verifier:codeVerifier,redirect_uri:REDIRECT}));return loadUser()}
 function login(parent,clientId,clientSecret){
  const id=String(clientId||read().clientId||'').trim();if(!/^[0-9a-f]{16,64}$/i.test(id))return Promise.reject(new Error('Enter your MyAnimeList client ID first'))
  const secret=clientSecret===undefined?(read().clientSecret||''):String(clientSecret||'').trim()
  write({...read(),clientId:id,clientSecret:secret})
  const codeVerifier=verifier(),state=crypto.randomBytes(12).toString('hex')
  return new Promise((resolve,reject)=>{
   const win=new BrowserWindow({width:560,height:760,parent:parent||undefined,modal:!!parent,title:'MyAnimeList',autoHideMenuBar:true,webPreferences:{partition:'mal-login',contextIsolation:true,nodeIntegration:false,sandbox:true}})
   authWindows.add(win.webContents.id)
   let done=false
   const finish=(err,val)=>{if(done)return;done=true;authWindows.delete(win.webContents.id);if(!win.isDestroyed())win.close();err?reject(err):resolve(val)}
   const check=(e,url)=>{
    if(!String(url).startsWith(REDIRECT))return false
    if(e&&e.preventDefault)e.preventDefault()
    const q=new URL(url).searchParams
    if(q.get('state')!==state)finish(new Error('MyAnimeList: sign-in answer not recognised, try again'))
    else if(q.get('code'))exchange(q.get('code'),codeVerifier).then(s=>finish(null,s),err=>finish(err))
    else finish(new Error(q.get('error')==='access_denied'?'MyAnimeList: access refused':'MyAnimeList did not give a code. Check that the App Redirect URL is '+REDIRECT))
    return true
   }
   win.webContents.on('will-redirect',(e,url)=>{check(e,url)})
   win.webContents.on('will-navigate',(e,url)=>{if(check(e,url))return;try{if(!ALLOWED.test(new URL(url).hostname))e.preventDefault()}catch{e.preventDefault()}})
   win.webContents.on('did-fail-load',(_e,_c,_d,url)=>{check(null,url)})
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}))
   win.on('closed',()=>finish(new Error('Sign-in window closed')))
   const q=new URLSearchParams({response_type:'code',client_id:id,code_challenge:codeVerifier,code_challenge_method:'plain',state,redirect_uri:REDIRECT})
   win.loadURL(AUTH+'?'+q.toString())
  })
 }
 function logout(){const s=read();write({clientId:s.clientId||'',clientSecret:s.clientSecret||''});try{session.fromPartition('mal-login').clearStorageData()}catch{}return status()}
 const isAuthWindow=wc=>authWindows.has(wc.id)
 const FIELDS='num_episodes,alternative_titles,main_picture,media_type,start_season'
 // Only the calls the app needs (no arbitrary request from the page).
 async function call(name,vars={}){
  const id=Number(vars.id)||0
  switch(name){
   case'search':return api('GET','/anime',{query:{q:String(vars.q||'').slice(0,64),limit:'6',fields:FIELDS}})
   case'entry':if(!id)throw new Error('MyAnimeList: missing id');return api('GET','/anime/'+id,{query:{fields:'num_episodes,my_list_status,alternative_titles'}})
   case'save':{if(!id)throw new Error('MyAnimeList: missing id');const form={};if(vars.status)form.status=String(vars.status);if(vars.episodes!=null)form.num_watched_episodes=String(Number(vars.episodes)||0);return api('PATCH','/anime/'+id+'/my_list_status',{form})}
   case'list':{const out=[];for(const st of['watching','plan_to_watch','on_hold']){const j=await api('GET','/users/@me/animelist',{query:{status:st,limit:'100',fields:'list_status,'+FIELDS}});out.push(...(j.data||[]))}return out}
   case'user':return loadUser()
   default:throw new Error('Unknown MyAnimeList call')
  }
 }
 return{status,login,logout,call,isAuthWindow,exchange,refresh}
}
module.exports={createMAL,REDIRECT,verifier}
