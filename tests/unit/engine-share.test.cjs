const test=require('node:test')
const assert=require('node:assert')
const http=require('http')
const os=require('os')
const fs=require('fs')
const path=require('path')
const {createEngineShare,parseLink}=require('../../electron/engine-share.cjs')

function engine(){return new Promise(r=>{const body=Buffer.alloc(1000,7);const s=http.createServer((req,res)=>{
 if(req.url==='/api/v1/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"status":"ok"}')}
 if(req.url.startsWith('/api/v1/hls')){res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'});return res.end(`#EXTM3U\n#EXTINF:4,\nhttp://127.0.0.1:${s.address().port}/api/v1/proxy?url=seg1\n`)}
 if(req.url==='/api/v1/extensions/install'&&req.method==='POST'){let b='';req.on('data',d=>b+=d);return req.on('end',()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({got:JSON.parse(b),type:req.headers['content-type']}))})}
 const m=/bytes=(\d+)-/.exec(req.headers.range||'');if(m){const a=+m[1];res.writeHead(206,{'Content-Type':'video/mp4','Content-Range':`bytes ${a}-999/1000`,'Content-Length':1000-a});return res.end(body.subarray(a))}
 res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':1000});res.end(body)});s.listen(0,'127.0.0.1',()=>r(s))})}

test('PC share: off by default, then the phone reaches the engine with the code (JSON, POST, ranges, HLS), nothing without it',async()=>{
 const up=await engine(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'nr-share-')),configFile=path.join(dir,'share.json')
 const make=()=>createEngineShare({configFile,enginePort:up.address().port,port:0,addresses:()=>['192.168.1.5']})
 let share=make()
 try{
  let st=await share.restore()
  assert.equal(st.enabled,false);assert.equal(st.link,'');assert.match(st.code,/^[a-z2-9]{10}$/)
  st=await share.enable()
  assert.equal(st.enabled,true);assert.equal(st.link,'192.168.1.5:'+st.port+'/'+st.code);assert.deepEqual(st.addresses,['192.168.1.5:'+st.port])
  const base='http://127.0.0.1:'+st.port+'/e/'+st.code
  assert.deepEqual(await (await fetch(base+'/api/v1/health')).json(),{status:'ok'})
  const post=await (await fetch(base+'/api/v1/extensions/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apk:'x.apk'})})).json()
  assert.deepEqual(post,{got:{apk:'x.apk'},type:'application/json'})
  const part=await fetch(base+'/api/v1/proxy?url=v',{headers:{Range:'bytes=990-'}})
  assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),'bytes 990-999/1000');assert.equal((await part.arrayBuffer()).byteLength,10)
  // Playlists: the segments come back through the relay, at the address the phone used.
  assert.equal(await (await fetch(base+'/api/v1/hls?url=x')).text(),`#EXTM3U\n#EXTINF:4,\n${base}/api/v1/proxy?url=seg1\n`)
  // "Continue on my phone": the phone gets what was sent after its last look, once.
  assert.deepEqual((await (await fetch(base+'/nr/inbox')).json()).items,[])
  assert.throws(()=>share.send({kind:'nope',id:'x'}),/Nothing to send/)
  const sent=share.send({kind:'series',id:'series1',name:'Lanterns',sub:'S1 E3',url:'/ep/3',next:false,extra:'dropped'})
  const box=await (await fetch(base+'/nr/inbox?after=0')).json()
  assert.deepEqual(box.items,[{at:sent.at,kind:'series',id:'series1',name:'Lanterns',sub:'S1 E3',url:'/ep/3',next:false}])
  assert.deepEqual((await (await fetch(base+'/nr/inbox?after='+sent.at)).json()).items,[])
  // Wrong code, no code, or something that is not the engine's API: nothing.
  for(const u of['http://127.0.0.1:'+st.port+'/e/aaaaaaaaaa/api/v1/health','http://127.0.0.1:'+st.port+'/api/v1/health',base+'/other','http://127.0.0.1:'+st.port+'/'])assert.equal((await fetch(u)).status,404)
  assert.ok(share.status().lastSeen>0)
  // Kept between starts: same code, on again.
  share.stop();share=make();const again=await share.restore()
  assert.equal(again.enabled,true);assert.equal(again.code,st.code)
  // A new code cuts the phones linked before.
  const renewed=share.renew();assert.notEqual(renewed.code,st.code)
  assert.equal((await fetch('http://127.0.0.1:'+again.port+'/e/'+st.code+'/api/v1/health')).status,404)
  assert.equal((await fetch('http://127.0.0.1:'+again.port+'/e/'+renewed.code+'/api/v1/health')).status,200)
  assert.equal(share.disable().enabled,false)
  await assert.rejects(fetch('http://127.0.0.1:'+again.port+'/e/'+renewed.code+'/api/v1/health'))
  share=make();assert.equal((await share.restore()).enabled,false)
  // Engine stopped: a clear answer, not a hang.
  await share.enable();up.close();await new Promise(r=>setTimeout(r,50))
  const down=await fetch('http://127.0.0.1:'+share.status().port+'/e/'+share.status().code+'/api/v1/health')
  assert.equal(down.status,502);assert.match((await down.json()).error,/not running/)
 }finally{share.stop();try{up.close()}catch{};fs.rmSync(dir,{recursive:true,force:true})}
})

test('PC share: the link typed on the phone',()=>{
 assert.equal(parseLink('192.168.1.5:4580/abcdefghjk'),'http://192.168.1.5:4580/e/abcdefghjk')
 assert.equal(parseLink('  HTTP://192.168.1.5:4580/ABCDEFGHJK/ '),'http://192.168.1.5:4580/e/abcdefghjk')
 assert.equal(parseLink('192.168.1.5 : 4580 / abcde fghjk'),'http://192.168.1.5:4580/e/abcdefghjk')
 assert.equal(parseLink('http://192.168.1.5:4580/e/abcdefghjk'),'http://192.168.1.5:4580/e/abcdefghjk')
 for(const bad of['','192.168.1.5','192.168.1.5:4580','192.168.1.5:4580/short','hello'])assert.equal(parseLink(bad),'')
})

test('PC share: consecutive messages with identical wall clock time both reach the phone',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nr-share-cursor-'))
 const share=createEngineShare({configFile:path.join(dir,'share.json'),port:0,addresses:()=>['192.168.1.5']})
 const realNow=Date.now
 try{
  const st=await share.enable()
  Date.now=()=>1800000000000
  const first=share.send({kind:'books',id:'first',name:'Book one'})
  const second=share.send({kind:'books',id:'second',name:'Book two'})
  assert.ok(second.at>first.at,'The second message needs a unique polling cursor')
  const url='http://127.0.0.1:'+st.port+'/e/'+st.code+'/nr/inbox?after='+first.at
  const response=await fetch(url)
  assert.equal(response.status,200)
  const box=await response.json()
  assert.deepEqual(box.items.map(x=>x.id),['second'])
 }finally{Date.now=realNow;share.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
