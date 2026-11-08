const test=require('node:test')
const assert=require('node:assert')
const fs=require('fs'),os=require('os'),path=require('path'),{EventEmitter}=require('events')
const {createSubtitles,srtToVtt,assToVtt,decode}=require('../../electron/subtitles.cjs')

test('subtitles: SRT / ASS to WebVTT, text encodings',()=>{
 assert.equal(srtToVtt('\uFEFF1\r\n00:00:01,500 --> 0:00:03,2\r\n{\\an8}Bonjour\r\n'),'WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.200\nBonjour\n')
 assert.match(assToVtt('[Script Info]\n[Events]\nDialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\i1}Salut\\Nça va'),/00:00:01\.500 --> 00:00:03\.000\nSalut\nça va/)
 assert.equal(decode(Buffer.from([0x43,0x61,0x66,0xe9])),'Café') // windows-1252
 assert.equal(decode(Buffer.from('Café','utf8')),'Café')
})

const res=(body,status=200)=>({ok:status<400,status,json:async()=>body,text:async()=>String(body),arrayBuffer:async()=>{const b=Buffer.isBuffer(body)?body:Buffer.from(String(body));return b.buffer.slice(b.byteOffset,b.byteOffset+b.length)},headers:{get:()=>null}})
test('subtitles online: IMDb id from the title, Wyzie search for the episode, best language first',async()=>{
 const calls=[]
 const fetchImpl=async url=>{calls.push(url)
  if(url.includes('media-imdb.com'))return res({d:[{id:'tt0111161',l:'The Shawshank Redemption',qid:'movie',y:1994},{id:'tt2861424',l:'Rick and Morty',qid:'tvSeries',y:2013}]})
  if(url==='https://sub.wyzie.io/c/2')return res('1\n00:00:01,000 --> 00:00:02,000\nSalut\n')
  if(url.includes('sub.wyzie.io/search'))return res([{id:'1',url:'https://sub.wyzie.io/c/1/id/1?format=srt',language:'en',display:'English',release:'WEB-DL',format:'srt',downloadCount:50},{id:'2',url:'https://sub.wyzie.io/c/2',language:'fr',display:'French',release:'VFF',format:'srt',downloadCount:3},{id:'3',url:'https://x/3',language:'fr',display:'French',format:'srt',isHearingImpaired:true,downloadCount:99}])
  if(url==='https://sub.wyzie.io/c/2')return res('1\n00:00:01,000 --> 00:00:02,000\nSalut\n')
  return res('',404)}
 const s=createSubtitles({app:{getPath:()=>os.tmpdir()},fetchImpl,ensureFfmpeg:async()=>'ffmpeg'})
 await assert.rejects(s.search({title:'Rick and Morty',kind:'series',key:''}),/NO_KEY/)
 const r=await s.search({title:'Rick and Morty',kind:'series',season:2,episode:3,langs:['fr','en'],key:'K'})
 assert.deepEqual(r.imdb,{id:'tt2861424',title:'Rick and Morty',year:2013})
 const w=new URL(calls.find(u=>u.includes('wyzie')))
 assert.deepEqual(Object.fromEntries(w.searchParams),{id:'tt2861424',key:'K',season:'2',episode:'3',language:'fr,en'})
 assert.deepEqual(r.results.map(x=>x.id),['2','3','1']) // French first, hearing-impaired after
 assert.equal(await s.fetchSub({url:'https://sub.wyzie.io/c/2'}),'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nSalut\n')
 await assert.rejects(s.fetchSub({url:'file:///etc/passwd'}),/Bad subtitle address/)
 const m=await s.imdbFind('The Shawshank Redemption (Dub)',{kind:'movie'});assert.equal(m.id,'tt0111161')
})

test('subtitles AI: ffmpeg cuts the sound, whisper writes timed lines in video time',async()=>{
 const ud=fs.mkdtempSync(path.join(os.tmpdir(),'subs-')),wdir=path.join(ud,'tools','whisper')
 fs.mkdirSync(path.join(wdir,'Release'),{recursive:true});fs.writeFileSync(path.join(wdir,'Release','whisper-cli.exe'),'');fs.writeFileSync(path.join(wdir,'ggml-base.bin'),'')
 const runs=[]
 const spawnImpl=(cmd,args)=>{runs.push([path.basename(cmd),args]);const c=new EventEmitter();c.stderr=new EventEmitter()
  setTimeout(()=>{if(args.includes('-oj')){const of=args[args.indexOf('-of')+1];fs.writeFileSync(of+'.json',JSON.stringify({result:{language:'ja'},transcription:[{offsets:{from:1200,to:3400},text:' Konnichiwa '},{offsets:{from:4000,to:5000},text:'[Music]'},{offsets:{from:6000,to:8000},text:'Arigatou'}]}))}c.emit('close',0)},5);return c}
 const s=createSubtitles({app:{getPath:()=>ud},spawnImpl,platform:'win32',ensureFfmpeg:async()=>'C:/tools/ffmpeg.exe'})
 assert.equal(s.aiReady('base'),true)
 await assert.rejects(s.transcribe({src:'https://evil/x.mkv',start:0}),/Only local streams/)
 const r=await s.transcribe({src:'http://127.0.0.1:4567/api/v1/proxy?url=x',start:60,dur:30})
 assert.equal(r.language,'ja')
 assert.deepEqual(r.lines,[{start:61.2,end:63.4,text:'Konnichiwa'},{start:66,end:68,text:'Arigatou'}]) // [Music] dropped
 assert.equal(runs[0][0],'ffmpeg.exe');assert.deepEqual(runs[0][1].slice(4,10),['-ss','60','-t','30','-i','http://127.0.0.1:4567/api/v1/proxy?url=x'])
 assert.ok(runs[0][1].includes('16000'))
 assert.equal(runs[1][0],'whisper-cli.exe');assert.ok(runs[1][1].includes(path.join(wdir,'ggml-base.bin')));assert.equal(runs[1][1][runs[1][1].indexOf('-l')+1],'auto')
 assert.deepEqual(fs.readdirSync(os.tmpdir()).filter(f=>f.startsWith('nr-whisper-')),[]) // temporary files removed
})
