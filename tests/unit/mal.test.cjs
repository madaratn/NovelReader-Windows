const test=require('node:test')
const assert=require('node:assert')
const fs=require('fs'),os=require('os'),path=require('path')
const {createMAL,verifier}=require('../../electron/mal.cjs')

test('MyAnimeList: code exchange, user, whitelisted calls, refresh on 401, errors explained',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mal-')),calls=[]
 let expired=true
 const res=(status,j)=>({status,ok:status<400,json:async()=>j})
 const fetchImpl=async(url,opt)=>{
  calls.push({url,method:opt.method,auth:opt.headers.Authorization,body:opt.body})
  if(url.includes('/oauth2/token')){const b=new URLSearchParams(opt.body);if(b.get('grant_type')==='refresh_token')return res(200,{access_token:'tok2',refresh_token:'r2',expires_in:3600});return res(200,{access_token:'tok1',refresh_token:'r1',expires_in:3600})}
  if(url.includes('/users/@me?'))return res(200,{id:7,name:'ali',picture:'p.png'})
  if(url.includes('/my_list_status')){if(expired&&opt.headers.Authorization==='Bearer tok1')return res(401,{error:'invalid_token'});return res(200,{status:'watching',num_episodes_watched:3})}
  if(url.includes('/animelist'))return res(200,{data:[{node:{id:1,title:'A'},list_status:{status:'watching'}}]})
  return res(404,{error:'not_found'})
 }
 const mal=createMAL({BrowserWindow:null,session:null,profiles:{dataPath:(...p)=>path.join(dir,...p)},fetchImpl})
 assert.equal(mal.status().connected,false)
 await assert.rejects(mal.call('list',{}),/not signed in/)
 const v=verifier();assert.ok(v.length>=43&&v.length<=128&&/^[A-Za-z0-9\-._~]+$/.test(v))
 fs.writeFileSync(path.join(dir,'myanimelist.json'),JSON.stringify({clientId:'abc'}))
 const s=await mal.exchange('CODE',v)
 assert.equal(s.connected,true);assert.equal(s.user.name,'ali')
 const tok=new URLSearchParams(calls[0].body)
 assert.equal(tok.get('code'),'CODE');assert.equal(tok.get('code_verifier'),v);assert.equal(tok.get('client_id'),'abc');assert.equal(tok.get('client_secret'),null)
 // 401 -> refresh with the refresh token, then the call is replayed
 const r=await mal.call('save',{id:5,episodes:3,status:'watching'})
 assert.equal(r.num_episodes_watched,3)
 const patch=calls.filter(c=>c.method==='PATCH');assert.equal(patch.length,2);assert.equal(patch[1].auth,'Bearer tok2')
 assert.equal(new URLSearchParams(patch[1].body).get('num_watched_episodes'),'3')
 assert.match(patch[1].url,/\/anime\/5\/my_list_status$/)
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'myanimelist.json'),'utf8'));assert.equal(saved.refresh,'r2')
 const list=await mal.call('list',{});assert.equal(list.length,3) // watching + planned + on hold
 await assert.rejects(mal.call('anything',{}),/Unknown MyAnimeList call/)
 await assert.rejects(mal.call('entry',{id:9}),/MyAnimeList: not_found/)
})
