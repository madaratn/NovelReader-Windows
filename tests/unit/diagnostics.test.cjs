// Problem report: logs are captured and personal data is masked.
const test=require('node:test')
const assert=require('node:assert')
const os=require('os')
const path=require('path')
const d=require('../../electron/diagnostics.cjs')

test('redact masks the home folder, secrets in links and auth headers',()=>{
 const home=os.homedir()
 const out=d.redact(path.join(home,'AppData','x.log')+' https://cdn.test/v.m3u8?token=abc123&q=1&api_key=zz Authorization: Bearer secret cookie=sess1')
 assert.ok(!out.includes(home),out)
 assert.match(out,/token=\*\*\*&q=1&api_key=\*\*\*/)
 assert.ok(!/secret|sess1|abc123/.test(out),out)
})

test('capture keeps recent console lines and collect returns them with versions',()=>{
 d.capture()
 const orig=process.stderr.write;process.stderr.write=()=>true
 try{console.warn('[downloads] candidate failed',{code:42});console.error(new Error('boom'))}finally{process.stderr.write=orig}
 const data=d.collect({app:{getVersion:()=>'0.5.0',getLocale:()=>'fr'},engineRoot:'/nowhere',engineLogs:[{time:'2026-01-01T10:00:00Z',kind:'stderr',line:'Hoster error'}],engineRunning:true})
 assert.equal(data.app,'0.5.0');assert.equal(data.engine.running,true)
 assert.ok(data.mainLogs.some(l=>l.includes('WARN [downloads] candidate failed {"code":42}')),data.mainLogs.join('\n'))
 assert.ok(data.mainLogs.some(l=>l.includes('ERROR Error: boom')))
 assert.deepEqual(data.engineLogs,['10:00:00 ERR Hoster error'])
})
