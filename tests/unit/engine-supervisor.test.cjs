const test=require('node:test')
const assert=require('node:assert')
const{createEngineSupervisor,engineDown}=require('../../electron/engine-supervisor.cjs')

const refused=()=>Object.assign(new TypeError('fetch failed'),{cause:Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:4567'),{code:'ECONNREFUSED'})})
// A fake engine: `up` says whether it answers, `running` whether its process exists.
function fake({up=false,running=false,bootAfter=3,crash=false}={}){
 const s={up,running,starts:0,calls:[],healths:0,slept:0,time:0}
 const answer=p=>{s.calls.push(p);if(!s.up)throw refused();return{ok:p}}
 const sup=createEngineSupervisor({
  request:async p=>answer(p),
  health:async()=>{s.healths++;if(s.running&&!crash&&s.healths>=bootAfter)s.up=true;if(crash)s.running=false;if(!s.up)throw refused();return{}},
  isRunning:()=>s.running,
  start:()=>{s.starts++;s.running=true},
  sleep:async ms=>{s.slept+=ms;s.time+=ms},now:()=>s.time,waitMs:5000,stepMs:100})
 return{s,sup}
}

test('what counts as "the engine is down"',()=>{
 assert.ok(engineDown(refused()))
 assert.ok(engineDown(Object.assign(new Error('x'),{cause:{code:'ECONNRESET'}})))
 assert.ok(engineDown(new Error('socket hang up')))
 assert.ok(!engineDown(new Error('Miwayomi HTTP 500 — {"error":"Unknown host"}')))
 assert.ok(!engineDown(new Error('Miwayomi request timed out after 15 s (/api/v1/anime/1/search)')))
 assert.ok(!engineDown(null))
})

test('engine running: the request goes through, nothing is restarted',async()=>{
 const{s,sup}=fake({up:true,running:true})
 assert.deepEqual(await sup.call('/api/v1/sources'),{ok:'/api/v1/sources'})
 assert.equal(s.starts,0);assert.equal(s.healths,0)
})

test('engine stopped: it is started, waited for, and the request is sent again',async()=>{
 const{s,sup}=fake({})
 assert.deepEqual(await sup.call('/api/v1/sources'),{ok:'/api/v1/sources'})
 assert.equal(s.starts,1)
 assert.deepEqual(s.calls,['/api/v1/sources','/api/v1/sources'])
 assert.ok(s.slept>0)
})

test('engine still starting (the app just opened): waited for, not started twice',async()=>{
 const{s,sup}=fake({running:true,bootAfter:4})
 await sup.call('/api/v1/anime/1/popular?page=1')
 assert.equal(s.starts,0);assert.equal(s.healths,4)
})

test('several requests at once share one wait and one start',async()=>{
 const{s,sup}=fake({})
 const r=await Promise.all([sup.call('/a'),sup.call('/b'),sup.call('/c')])
 assert.deepEqual(r.map(x=>x.ok),['/a','/b','/c'])
 assert.equal(s.starts,1)
})

test('an answer from the engine, even an error, is passed on without restart',async()=>{
 const s={starts:0}
 const sup=createEngineSupervisor({request:async()=>{throw new Error('Miwayomi HTTP 404 — not found')},health:async()=>({}),isRunning:()=>true,start:()=>{s.starts++}})
 await assert.rejects(()=>sup.call('/x'),/HTTP 404/)
 assert.equal(s.starts,0)
})

test('engine that never comes up: a clear message after the wait, not an endless one',async()=>{
 const{s,sup}=fake({running:true,bootAfter:1e9})
 await assert.rejects(()=>sup.call('/x'),/did not start within 5 s/)
 assert.ok(s.time>=5000)
 // The next request waits again (a new try), it is not refused for ever.
 s.healths=1e9-1
 assert.deepEqual(await sup.call('/y'),{ok:'/y'})
})

test('engine that stops as soon as it starts: three tries, then it says so',async()=>{
 const{s,sup}=fake({crash:true})
 await assert.rejects(()=>sup.call('/x'),/stops as soon as it starts/)
 assert.equal(s.starts,3)
})

test('engine not installed (development copy): said at once',async()=>{
 const sup=createEngineSupervisor({request:async()=>{throw refused()},health:async()=>{throw refused()},isRunning:()=>false,start:()=>false,sleep:async()=>{}})
 await assert.rejects(()=>sup.call('/x'),/not installed/)
})

test('while the app closes, nothing starts the engine again',async()=>{
 const{s,sup}=fake({})
 sup.stop()
 await assert.rejects(()=>sup.call('/x'),/fetch failed/)
 assert.equal(s.starts,0)
 await assert.rejects(()=>sup.ready(),/closing/)
 sup.resume()
 assert.deepEqual(await sup.call('/x'),{ok:'/x'})
})
