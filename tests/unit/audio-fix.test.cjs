const test=require('node:test')
const assert=require('node:assert')
const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),{execSync}=require('child_process')
const {createAudioFix,parseStreams,FFMPEG_URL}=require('../../electron/audio-fix.cjs')

test('audio fix: ffmpeg output parsed into sound tracks',()=>{
 const out=`Input #0, matroska,webm, from 'x':
  Stream #0:0: Video: h264 (High), yuv420p, 1920x800, SAR 1:1 DAR 12:5, 23.98 fps (default)
  Stream #0:1(fre): Audio: eac3, 48000 Hz, 5.1(side), fltp (default)
    Metadata:
      title           : VFF
  Stream #0:2(eng): Audio: dts (DTS-HD MA), 48000 Hz, 7.1, s32p (24 bit)
  Stream #0:3(eng): Subtitle: subrip`
 assert.deepEqual(parseStreams(out),[
  {index:0,lang:'fre',codec:'eac3',channels:'5.1(side)',title:'VFF',default:true},
  {index:1,lang:'eng',codec:'dts',channels:'7.1',title:'',default:false}])
 assert.equal(FFMPEG_URL('win32','x64'),'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz')
})

let hasFfmpeg=true;try{execSync('ffmpeg -version',{stdio:'ignore'})}catch{hasFfmpeg=false}
test('audio fix: converts the sound of a local stream to AAC, from a given time',{skip:!hasFfmpeg&&'no ffmpeg on this machine'},async()=>{
 const clip=fs.readFileSync(path.join(__dirname,'../ui/fixtures/clip.webm'))
 const srv=http.createServer((req,res)=>{const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');if(!m){res.writeHead(200,{'Content-Length':clip.length,'Accept-Ranges':'bytes','Content-Type':'video/webm'});res.end(clip);return}const s=+m[1],e=m[2]?Math.min(+m[2],clip.length-1):clip.length-1;res.writeHead(206,{'Content-Range':`bytes ${s}-${e}/${clip.length}`,'Content-Length':e-s+1,'Accept-Ranges':'bytes'});res.end(clip.subarray(s,e+1))})
 await new Promise(r=>srv.listen(0,'127.0.0.1',r))
 const src=`http://127.0.0.1:${srv.address().port}/api/v1/proxy?x=1`
 const fix=createAudioFix({app:{getPath:()=>fs.mkdtempSync(path.join(os.tmpdir(),'af-'))},platform:'linux',log:{warn(){}}})
 try{
  await assert.rejects(fix.probe('https://example.com/a.mkv'),/Only local streams/)
  const r=await fix.start(src)
  assert.equal(r.streams.length,1);assert.equal(r.streams[0].codec,'opus')
  const got=await fetch(r.base+'?src='+encodeURIComponent(src)+'&t=5&track=0')
  assert.equal(got.headers.get('content-type'),'audio/aac')
  const buf=Buffer.from(await got.arrayBuffer())
  assert.ok(buf.length>20000,'some audio: '+buf.length)
  assert.equal(buf[0],0xff);assert.equal(buf[1]&0xf0,0xf0) // ADTS sync word
  // 15 s of the 20 s clip: about 15/20 of the full length
  const full=Buffer.from(await (await fetch(r.base+'?src='+encodeURIComponent(src)+'&t=0&track=0')).arrayBuffer())
  assert.ok(buf.length<full.length*0.85&&buf.length>full.length*0.6,`seek works (${buf.length} / ${full.length})`)
  assert.equal((await fetch(r.base+'?src='+encodeURIComponent('https://evil.test/x')+'&t=0')).status,404)
 }finally{fix.close();srv.close()}
})
