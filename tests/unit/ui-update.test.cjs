const test=require('node:test')
const assert=require('node:assert')
const fs=require('fs'),os=require('os'),path=require('path'),{execFileSync}=require('child_process')
const {createUiUpdate,shellId,newer}=require('../../electron/ui-update.cjs')

function makeApp(version,ui='<h1>v</h1>'){
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'uiapp-'))
 fs.mkdirSync(path.join(d,'electron'));fs.writeFileSync(path.join(d,'electron','main.cjs'),'// main\n')
 fs.mkdirSync(path.join(d,'dist','assets'),{recursive:true});fs.writeFileSync(path.join(d,'dist','index.html'),ui);fs.writeFileSync(path.join(d,'dist','assets','app.js'),'console.log(1)')
 fs.writeFileSync(path.join(d,'package.json'),JSON.stringify({version}))
 return d
}
const bundle=dir=>{execFileSync(process.execPath,[path.join(__dirname,'../../scripts/ui-bundle.mjs')],{cwd:dir});return path.join(dir,'release')}
const fakeFetch=(rel,calls=[])=>async url=>{calls.push(url);const f=path.join(rel,url.split('/').pop());if(!fs.existsSync(f))return{ok:false,status:404};const b=fs.readFileSync(f);return{ok:true,status:200,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length)}}

test('interface update: same shell -> downloaded, checked, applied; bad start falls back',async()=>{
 assert.ok(newer('0.10.0','0.9.9'));assert.ok(!newer('0.10.0','0.10.0'))
 const installed=makeApp('1.0.0'),next=makeApp('1.1.0','<h1>new</h1>'),rel=bundle(next)
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'ud-'))
 const app={getVersion:()=>'1.0.0',getPath:()=>userData,getAppPath:()=>installed}
 const ui=createUiUpdate({app,base:'https://x/',fetchImpl:fakeFetch(rel),log:{warn(){}}})
 assert.equal(ui.entry(),path.join(installed,'dist','index.html'))
 const seen=[];ui.onStatus(s=>seen.push(s.state))
 const st=await ui.check()
 assert.equal(st.state,'ready');assert.equal(st.version,'1.1.0');assert.deepEqual(seen,['downloading','ready'])
 const file=ui.apply()
 assert.equal(fs.readFileSync(file,'utf8'),'<h1>new</h1>')
 assert.equal(fs.readFileSync(path.join(path.dirname(file),'assets','app.js'),'utf8'),'console.log(1)')
 assert.equal(ui.version(),'1.1.0')
 ui.ok() // the reloaded page says it started
 // Next start: the new interface, confirmed by the page
 const ui2=createUiUpdate({app,base:'https://x/',fetchImpl:fakeFetch(rel),log:{warn(){}}})
 assert.equal(ui2.entry(),file);ui2.ok()
 assert.equal((await ui2.check()).state,'idle') // nothing newer
 // A start that never says "ok": the next start goes back to the built-in interface
 const ui3=createUiUpdate({app,base:'https://x/',fetchImpl:fakeFetch(rel),log:{warn(){}}});ui3.entry()
 const ui4=createUiUpdate({app,base:'https://x/',fetchImpl:fakeFetch(rel),log:{warn(){}}})
 assert.equal(ui4.entry(),path.join(installed,'dist','index.html'))
 assert.equal((await ui4.check()).state,'idle') // that version is skipped from now on
 // Once the full update installs 1.1.0 itself, the built-in interface is used
 const ui5=createUiUpdate({app:{...app,getVersion:()=>'1.1.0'},base:'https://x/',fetchImpl:fakeFetch(rel),log:{warn(){}}})
 assert.equal(ui5.entry(),path.join(installed,'dist','index.html'))
})

test('interface update: other main-process code -> waits for the normal update; tampered file refused',async()=>{
 const installed=makeApp('1.0.0'),next=makeApp('1.1.0')
 fs.writeFileSync(path.join(next,'electron','main.cjs'),'// main changed\n')
 assert.notEqual(shellId(installed),shellId(next))
 const rel=bundle(next),userData=fs.mkdtempSync(path.join(os.tmpdir(),'ud-'))
 const app={getVersion:()=>'1.0.0',getPath:()=>userData,getAppPath:()=>installed}
 const calls=[]
 const ui=createUiUpdate({app,base:'https://x/',fetchImpl:fakeFetch(rel,calls),log:{warn(){}}})
 assert.equal((await ui.check()).state,'needs-restart');assert.equal(calls.length,1)
 // Same shell but the downloaded file does not match ui.json
 const same=makeApp('1.2.0'),rel2=bundle(same),m=JSON.parse(fs.readFileSync(path.join(rel2,'ui.json')))
 fs.appendFileSync(path.join(rel2,m.file),'x')
 const ui2=createUiUpdate({app,base:'https://x/',fetchImpl:fakeFetch(rel2),log:{warn(){}}})
 const st=await ui2.check();assert.equal(st.state,'error');assert.match(st.error,/checksum/)
 assert.equal(ui2.apply(),null)
})
