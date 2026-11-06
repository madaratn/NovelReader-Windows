const test=require('node:test')
const assert=require('node:assert')
const fs=require('fs'),os=require('os'),path=require('path')
const {createAniList}=require('../../electron/anilist.cjs')

test('AniList: token stored per profile folder, user read, list query gets the user id, errors explained',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'al-')),calls=[]
 let reply={data:{Viewer:{id:7,name:'ali',avatar:{medium:'a.png'},siteUrl:'u'}}},status=200
 const fetchImpl=async(url,opt)=>{calls.push({url,auth:opt.headers.Authorization,body:JSON.parse(opt.body)});return{status,ok:status<400,json:async()=>reply}}
 const al=createAniList({BrowserWindow:null,session:null,profiles:{dataPath:(...p)=>path.join(dir,...p)},fetchImpl})
 assert.equal(al.status().connected,false)
 await assert.rejects(al.call('list',{type:'ANIME'}),/not signed in/)
 const s=await al.setToken('tok123',3600)
 assert.equal(s.connected,true);assert.equal(s.user.name,'ali');assert.equal(calls[0].auth,'Bearer tok123')
 reply={data:{MediaListCollection:{lists:[]}}}
 await al.call('list',{type:'ANIME'})
 assert.equal(calls[1].body.variables.userId,7);assert.match(calls[1].body.query,/MediaListCollection/)
 await assert.rejects(al.call('anything',{}),/Unknown AniList call/)
 status=401;reply={errors:[{message:'Invalid token'}]}
 await assert.rejects(al.call('entry',{id:1}),/session expired/)
 assert.ok(!fs.readFileSync(path.join(dir,'anilist.json'),'utf8').includes('"token":""'))
})
