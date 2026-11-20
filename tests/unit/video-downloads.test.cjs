// Offline video downloads: HLS (master + audio rendition + key), direct files,
// fallback to the next stream, local server with ranges, removal.
const test=require('node:test')
const assert=require('node:assert')
const fs=require('fs')
const os=require('os')
const path=require('path')
const http=require('http')
const {createVideoDownloads,pathOf}=require('../../electron/video-downloads.cjs')

function engine(){
 const hits=[]
 const routes={
  '/master.m3u8':'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Japanese",LANGUAGE="ja",DEFAULT=YES,URI="audio/ja.m3u8"\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="EN",URI="subs.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x720,AUDIO="aud",SUBTITLES="subs"\nv720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=3840x2160,AUDIO="aud"\nv2160.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360,AUDIO="aud"\nv360.m3u8\n',
  '/v720.m3u8':'#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-KEY:METHOD=AES-128,URI="/key?id=1"\n#EXTINF:4,\nseg?n=1\n#EXTINF:4,\nseg?n=2\n#EXTINF:4,\nhttp://127.0.0.1:PORT/seg?n=3\n#EXT-X-ENDLIST\n',
  '/v360.m3u8':'#EXTM3U\n#EXTINF:4,\nseg?n=9\n#EXT-X-ENDLIST\n',
  '/audio/ja.m3u8':'#EXTM3U\n#EXTINF:4,\na1.aac\n#EXTINF:4,\na2.aac\n#EXT-X-ENDLIST\n',
  '/key':'0123456789abcdef','/seg':'SEGMENT','/audio/a1.aac':'AAC1','/audio/a2.aac':'AAC2',
  '/movie.mp4':'MP4DATA-'.repeat(100),'/sub.vtt':'WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n'
 }
 const server=http.createServer((req,res)=>{hits.push(req.url);const u=new URL(req.url,'http://x');if(u.pathname==='/broken.m3u8'){res.writeHead(500);return res.end()}const body=routes[u.pathname];if(body==null){res.writeHead(404);return res.end()}const out=body.replace('PORT',server.address().port)+(u.pathname==='/seg'?u.searchParams.get('n'):'');res.writeHead(200,{'Content-Length':Buffer.byteLength(out)});res.end(out)})
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r({server,hits,base:'http://127.0.0.1:'+server.address().port})))
}
const waitDone=async(dl,id)=>{for(let i=0;i<200;i++){const x=dl.list().find(j=>j.id===id);if(x&&(x.state==='done'||x.state==='error'))return x;await new Promise(r=>setTimeout(r,25))}throw new Error('timeout')}

test('HLS: best variant up to 1080p, audio rendition, key, local playlists, then served and removed',async()=>{
 const {server,base}=await engine(),root=fs.mkdtempSync(path.join(os.tmpdir(),'nr-dl-'))
 const dl=createVideoDownloads({root})
 try{
  const {id}=dl.start({kind:'anime',mediaId:'a1',mediaName:'Frieren',episodeUrl:'/ep/1',episodeName:'Episode 1',mediaKey:'anime:a1:/ep/1',candidates:[{url:base+'/broken.m3u8',type:'hls'},{url:base+'/master.m3u8',type:'hls',title:'Server - 720p',subtitles:[{url:base+'/sub.vtt',label:'English'}]}]})
  const job=await waitDone(dl,id)
  assert.equal(job.state,'done',job.error)
  assert.match(job.file,/^p[0-9a-f]{10}\/index\.m3u8$/);assert.equal(job.title,'Server - 720p')
  const dir=path.join(root,id,path.dirname(job.file)),master=fs.readFileSync(path.join(dir,'index.m3u8'),'utf8')
  assert.match(master,/URI="a0_index\.m3u8"/);assert.match(master,/RESOLUTION=1280x720/);assert.doesNotMatch(master,/SUBTITLES/);assert.match(master,/vindex\.m3u8/)
  const v=fs.readFileSync(path.join(dir,'vindex.m3u8'),'utf8')
  assert.match(v,/URI="v0\.key"/);assert.deepEqual(v.split('\n').filter(l=>l&&!l.startsWith('#')),['v1.ts','v2.ts','v3.ts'])
  assert.equal(fs.readFileSync(path.join(dir,'v3.ts'),'utf8'),'SEGMENT3')
  assert.equal(fs.readFileSync(path.join(dir,'a0_1.aac'),'utf8'),'AAC2')
  assert.deepEqual(job.subtitles,[{label:'English',lang:'',file:path.dirname(job.file)+'/sub0.vtt'}])
  // Only the stream that was saved is left, without the notes for going on
  assert.deepEqual(fs.readdirSync(path.join(root,id)).sort(),['meta.json',path.dirname(job.file)]);assert.ok(!fs.readdirSync(dir).some(f=>/resume|\.part$/.test(f)))
  assert.ok(job.size>0)
  // Served locally with ranges, meta.json and paths outside the folder refused
  const b=await dl.base()
  assert.equal(await (await fetch(b+'/'+id+'/'+job.file)).text(),master)
  const seg=b+'/'+id+'/'+path.dirname(job.file)+'/v1.ts'
  assert.equal(await (await fetch(seg)).text(),'SEGMENT1')
  const r=await fetch(seg,{headers:{Range:'bytes=2-4'}});assert.equal(r.status,206);assert.equal(await r.text(),'GME')
  assert.equal((await fetch(b+'/'+id+'/meta.json')).status,403)
  assert.equal((await fetch(b+'/..%2F..%2Fetc%2Fpasswd')).status,403)
  assert.equal(dl.usage().count,1)
  dl.remove(id);assert.equal(dl.list().length,0);assert.ok(!fs.existsSync(path.join(root,id)))
 }finally{dl.close();server.close()}
})

test('direct file download, and an error when no stream works',async()=>{
 const {server,base}=await engine(),root=fs.mkdtempSync(path.join(os.tmpdir(),'nr-dl-'))
 const dl=createVideoDownloads({root})
 try{
  const a=dl.start({kind:'movie',mediaId:'m1',episodeUrl:'/movie',candidates:[{url:base+'/movie.mp4',type:'file'}]})
  const ok=await waitDone(dl,a.id);assert.equal(ok.state,'done');assert.match(ok.file,/^p[0-9a-f]{10}\/video\.mp4$/);assert.equal(fs.statSync(path.join(root,a.id,ok.file)).size,800)
  const b=dl.start({kind:'movie',mediaId:'m2',episodeUrl:'/movie',candidates:[{url:base+'/broken.m3u8',type:'hls'}]})
  const bad=await waitDone(dl,b.id);assert.equal(bad.state,'error');assert.match(bad.error,/HTTP 500/);assert.ok(!fs.existsSync(path.join(root,b.id)),'a failure that saved nothing leaves nothing')
  assert.throws(()=>dl.start({kind:'movie',mediaId:'m3',episodeUrl:'/x',candidates:[{url:'https://evil.test/x.mp4',type:'file'}]}),/no stream/)
  dl.clear();assert.equal(dl.list().length,0)
 }finally{dl.close();server.close()}
})

test('quality cap picks the variant under it, and the bandwidth limit slows the download',async()=>{
 const {server,base}=await engine(),root=fs.mkdtempSync(path.join(os.tmpdir(),'nr-dl-'))
 const dl=createVideoDownloads({root})
 try{
  assert.deepEqual(dl.configure({maxHeight:360}),{maxHeight:360,limit:0})
  const a=dl.start({kind:'anime',mediaId:'q',episodeUrl:'/1',candidates:[{url:base+'/master.m3u8',type:'hls'}]})
  const job=await waitDone(dl,a.id);assert.equal(job.state,'done',job.error)
  assert.match(fs.readFileSync(path.join(root,a.id,job.file),'utf8'),/RESOLUTION=640x360/)
  dl.configure({maxHeight:0,limit:1000})
  const t0=Date.now(),b=dl.start({kind:'movie',mediaId:'slow',episodeUrl:'/m',candidates:[{url:base+'/movie.mp4',type:'file'}]})
  assert.equal((await waitDone(dl,b.id)).state,'done')
  assert.ok(Date.now()-t0>=400,'limit should slow down an 800-byte file at 1000 B/s')
 }finally{dl.close();server.close()}
})

// ---- Cuts: silent connections, dropped ones, links that changed, the app closing ----
// A server whose routes are functions: (req, res, n) with n = how many times the
// path was asked for (1 the first time).
function flaky(routes){
 const hits=[],count={}
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');hits.push({path:u.pathname+u.search,range:req.headers.range||''});const n=count[u.pathname+u.search]=(count[u.pathname+u.search]||0)+1;const h=routes[u.pathname];if(!h){res.writeHead(404);return res.end()}h(req,res,n,u)})
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r({server,hits,base:'http://127.0.0.1:'+server.address().port,close:()=>{server.closeAllConnections&&server.closeAllConnections();server.close()}})))
}
// A file served like the engine proxy does: whole, or from a byte (Range).
const ranged=(body,req,res,{upTo=body.length}={})=>{const m=/bytes=(\d+)-/.exec(req.headers.range||'');const from=m?Number(m[1]):0;if(from>=body.length){res.writeHead(416,{'Content-Range':'bytes */'+body.length});return res.end()}if(m)res.writeHead(206,{'Content-Length':body.length-from,'Content-Range':`bytes ${from}-${body.length-1}/${body.length}`});else res.writeHead(200,{'Content-Length':body.length});if(upTo>=body.length)return res.end(body.subarray(from));res.write(body.subarray(from,upTo))}
const BODY=Buffer.from(Array.from({length:4000},(_,i)=>i%251))
const fast={stallMs:500,retryMs:10,patienceMs:1500}
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'nr-dl-'))

test('a direct file goes on from where it stopped when the connection goes silent, then drops',async()=>{
 const f=await flaky({'/film.mp4':(req,res,n)=>{
  if(n===1)return ranged(BODY,req,res,{upTo:1000})             // 1000 bytes, then nothing more
  if(n===2){ranged(BODY,req,res,{upTo:2500});return setTimeout(()=>res.destroy(),30)} // 1500 more, then the line drops
  ranged(BODY,req,res)}})
 const root=tmp(),dl=createVideoDownloads({root,...fast})
 try{
  const {id}=dl.start({kind:'movie',mediaId:'m',episodeUrl:'/m',candidates:[{url:f.base+'/film.mp4',type:'file'}]})
  const job=await waitDone(dl,id);assert.equal(job.state,'done',job.error)
  assert.deepEqual(fs.readFileSync(path.join(root,id,job.file)),BODY,'the file is whole, with no piece twice')
  assert.deepEqual(f.hits.map(h=>h.range),['','bytes=1000-','bytes=2500-'])
 }finally{dl.close();f.close()}
})

test('a server that ignores Range, or whose file changed, makes the file start over',async()=>{
 const other=Buffer.from('another file of another length'),longer=Buffer.concat([BODY,BODY]).reverse()
 const f=await flaky({
  '/longer.mp4':(req,res,n)=>{if(n===1){ranged(BODY,req,res,{upTo:900});return setTimeout(()=>res.destroy(),30)}ranged(longer,req,res)},
  '/norange.mp4':(req,res,n)=>{if(n===1){res.writeHead(200,{'Content-Length':BODY.length});res.write(BODY.subarray(0,1200));return setTimeout(()=>res.destroy(),30)}res.writeHead(200,{'Content-Length':BODY.length});res.end(BODY)},
  '/changed.mp4':(req,res,n)=>{if(n===1){ranged(BODY,req,res,{upTo:900});return setTimeout(()=>res.destroy(),30)}ranged(other,req,res)}})
 const root=tmp(),dl=createVideoDownloads({root,...fast})
 try{
  const a=dl.start({kind:'movie',mediaId:'a',episodeUrl:'/a',candidates:[{url:f.base+'/norange.mp4',type:'file'}]})
  const ja=await waitDone(dl,a.id);assert.equal(ja.state,'done',ja.error);assert.deepEqual(fs.readFileSync(path.join(root,a.id,ja.file)),BODY)
  const b=dl.start({kind:'movie',mediaId:'b',episodeUrl:'/b',candidates:[{url:f.base+'/changed.mp4',type:'file'}]})
  const jb=await waitDone(dl,b.id);assert.equal(jb.state,'done',jb.error);assert.deepEqual(fs.readFileSync(path.join(root,b.id,jb.file)),other)
  const c=dl.start({kind:'movie',mediaId:'c',episodeUrl:'/c',candidates:[{url:f.base+'/longer.mp4',type:'file'}]})
  const jc=await waitDone(dl,c.id);assert.equal(jc.state,'done',jc.error);assert.deepEqual(fs.readFileSync(path.join(root,c.id,jc.file)),longer)
  assert.deepEqual(f.hits.filter(h=>h.path==='/longer.mp4').map(h=>h.range),['','bytes=900-',''])
 }finally{dl.close();f.close()}
})

const PLAYLIST=n=>'#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n'+Array.from({length:n},(_,i)=>'#EXTINF:4,\nseg'+(i+1)+'.ts?token=T\n').join('')+'#EXT-X-ENDLIST\n'
test('an HLS download that failed keeps its segments: the next try only fetches what is missing',async()=>{
 let broken=true,key='KEY-ONE',token='a'
 const seg=(req,res,n,u)=>{const no=Number(/seg(\d+)/.exec(u.pathname)[1]);if(no===4&&broken)return setTimeout(()=>{res.writeHead(404);res.end()},120);res.end('SEG'+no)}
 const routes={'/v.m3u8':(req,res)=>res.end(PLAYLIST(6).replace(/token=T/g,'token='+token)),'/key':(req,res)=>res.end(key)}
 for(let i=1;i<=6;i++)routes['/seg'+i+'.ts']=seg
 const f=await flaky(routes),root=tmp(),dl=createVideoDownloads({root,...fast})
 const asked=no=>f.hits.filter(h=>h.path.startsWith('/seg'+no+'.ts')).length
 try{
  const p={kind:'anime',mediaId:'a',episodeUrl:'/1',candidates:[{url:f.base+'/v.m3u8?token=a',type:'hls'}]}
  const {id}=dl.start(p),first=await waitDone(dl,id)
  assert.equal(first.state,'error');assert.match(first.error,/HTTP 404/)
  const parts=fs.readdirSync(path.join(root,id));assert.equal(parts.length,1,'the part is kept')
  assert.deepEqual(fs.readdirSync(path.join(root,id,parts[0])).filter(x=>/\.ts$/.test(x)).sort(),['v1.ts','v2.ts','v3.ts','v5.ts','v6.ts'])
  // Fresh links (another token), the missing segment is back: only that one is fetched
  broken=false;token='b'
  dl.start({...p,candidates:[{url:f.base+'/v.m3u8?token=b',type:'hls'}]})
  const again=await waitDone(dl,id);assert.equal(again.state,'done',again.error)
  for(const no of [1,2,3,5,6])assert.equal(asked(no),1,'segment '+no+' is not fetched twice')
  assert.equal(asked(4),2)
  const dir=path.join(root,id,path.dirname(again.file))
  for(let i=1;i<=6;i++)assert.equal(fs.readFileSync(path.join(dir,'v'+i+'.ts'),'utf8'),'SEG'+i)
  // Another key: what is saved cannot be read with it, everything is fetched again
  broken=true;const c=dl.start({...p,episodeUrl:'/2'}),half=await waitDone(dl,c.id);assert.equal(half.state,'error')
  broken=false;key='KEY-TWO';const before=f.hits.length
  dl.start({...p,episodeUrl:'/2'});const whole=await waitDone(dl,c.id);assert.equal(whole.state,'done',whole.error)
  assert.equal(f.hits.slice(before).filter(h=>/^\/seg/.test(h.path)).length,6)
  assert.equal(fs.readFileSync(path.join(root,c.id,path.dirname(whole.file),'v0.key'),'utf8'),'KEY-TWO')
 }finally{dl.close();f.close()}
})

test('a segment that fails for a moment is asked for again; a stream that dies gives way to the next one',async()=>{
 const routes={'/a.m3u8':(req,res)=>res.end(PLAYLIST(5)),'/b.m3u8':(req,res)=>res.end('#EXTM3U\n#EXTINF:4,\nb1.ts\n#EXTINF:4,\nb2.ts\n#EXT-X-ENDLIST\n'),'/key':(req,res)=>res.end('K'),'/b1.ts':(req,res)=>res.end('B1'),'/b2.ts':(req,res)=>res.end('B2')}
 let dead=false
 for(let i=1;i<=5;i++)routes['/seg'+i+'.ts']=(req,res,n)=>{if(dead&&i>=3){res.writeHead(503);return res.end()}if(i===2&&n<=3){res.writeHead(502);return res.end()}res.end('SEG'+i)}
 const f=await flaky(routes),root=tmp(),dl=createVideoDownloads({root,...fast,patienceMs:300})
 try{
  const a=dl.start({kind:'anime',mediaId:'a',episodeUrl:'/1',candidates:[{url:f.base+'/a.m3u8',type:'hls',title:'A'},{url:f.base+'/b.m3u8',type:'hls',title:'B'}]})
  const one=await waitDone(dl,a.id);assert.equal(one.state,'done',one.error);assert.equal(one.title,'A','three bad answers in a row do not end the download')
  dead=true
  const b=dl.start({kind:'anime',mediaId:'a',episodeUrl:'/2',candidates:[{url:f.base+'/a.m3u8',type:'hls',title:'A'},{url:f.base+'/b.m3u8',type:'hls',title:'B'}]})
  const two=await waitDone(dl,b.id);assert.equal(two.state,'done',two.error);assert.equal(two.title,'B')
  // The part of the stream that died is gone, and nothing of it was written into the other one
  assert.deepEqual(fs.readdirSync(path.join(root,b.id)).sort(),['meta.json',path.dirname(two.file)])
  assert.deepEqual(fs.readdirSync(path.join(root,b.id,path.dirname(two.file))).sort(),['v0.ts','v1.ts','vindex.m3u8'])
 }finally{dl.close();f.close()}
})

test('closing the app keeps what is saved and the next start goes on from it; cancelling keeps nothing',async()=>{
 let hang=true
 const f=await flaky({'/film.mp4':(req,res)=>hang?ranged(BODY,req,res,{upTo:1500}):ranged(BODY,req,res)})
 const root=tmp(),p={kind:'movie',mediaId:'m',episodeUrl:'/m',candidates:[{url:f.base+'/film.mp4?token=1',type:'file'}]}
 const one=createVideoDownloads({root,stallMs:60000,retryMs:10})
 try{
  const {id}=one.start(p)
  for(let i=0;i<100&&!(one.list()[0]?.bytes>=1500);i++)await new Promise(r=>setTimeout(r,20))
  assert.equal(one.list()[0].bytes,1500)
  one.close();await new Promise(r=>setTimeout(r,80))
  const part=fs.readdirSync(path.join(root,id))[0];assert.ok(part,'the part is still there after the app closed')
  // Rubbish from older runs: an empty folder, and a part nobody came back to for a week
  fs.mkdirSync(path.join(root,'movie_empty_0000000000','p0123456789'),{recursive:true})
  const old=path.join(root,'movie_old_0000000000','p0123456789');fs.mkdirSync(old,{recursive:true});fs.writeFileSync(path.join(old,'video.mp4'),'x');const longAgo=new Date(Date.now()-8*24*3600e3)
  for(const x of [path.join(old,'video.mp4'),old,path.dirname(old)])fs.utimesSync(x,longAgo,longAgo)
  // …and a folder somebody put there by hand: not ours to delete
  fs.mkdirSync(path.join(root,'Mes films'));fs.writeFileSync(path.join(root,'Mes films','film.mkv'),'x')
  const two=createVideoDownloads({root,...fast})
  try{
   assert.deepEqual(fs.readdirSync(root).sort(),['Mes films',id].sort());assert.deepEqual(two.list(),[],'an unfinished download is not listed as done')
   hang=false;const before=f.hits.length
   two.start({...p,candidates:[{url:f.base+'/film.mp4?token=2',type:'file'}]})
   const job=await waitDone(two,id);assert.equal(job.state,'done',job.error)
   assert.deepEqual(f.hits.slice(before).map(h=>h.range),['bytes=1500-']);assert.deepEqual(fs.readFileSync(path.join(root,id,job.file)),BODY)
   // Cancelling while it downloads, and cancelling a failed one that kept its part
   hang=true;const c=two.start({...p,mediaId:'c'})
   for(let i=0;i<100&&!(two.list().find(x=>x.id===c.id)?.bytes>=1500);i++)await new Promise(r=>setTimeout(r,20))
   two.cancel(c.id);for(let i=0;i<100&&fs.existsSync(path.join(root,c.id));i++)await new Promise(r=>setTimeout(r,20))
   assert.ok(!fs.existsSync(path.join(root,c.id)));assert.ok(!two.list().some(x=>x.id===c.id))
   // Cancelled, then asked for again at once: the new download is not swept away with the old one
   const d=two.start({...p,mediaId:'d'})
   for(let i=0;i<100&&!(two.list().find(x=>x.id===d.id)?.bytes>=1500);i++)await new Promise(r=>setTimeout(r,20))
   two.remove(d.id);hang=false;const again=two.start({...p,mediaId:'d'})
   assert.equal(again.id,d.id);const redo=await waitDone(two,d.id);assert.equal(redo.state,'done',redo.error)
   assert.deepEqual(fs.readFileSync(path.join(root,d.id,redo.file)),BODY)
  }finally{two.close()}
 }finally{one.close();f.close()}
})

test('the same stream is recognised whatever its tokens, its server name or the port of the engine',()=>{
 const via=(port,up,extra='')=>'http://127.0.0.1:'+port+'/api/v1/hls?url='+encodeURIComponent(up)+'&sourceId=1'+extra
 const a=via(4567,'https://cdn1.example.com/v/720/master.m3u8?token=abc&expires=1&id=7'),b=via(9999,'https://cdn2.example.com/v/720/master.m3u8?token=xyz&expires=2&id=7','&headers=x')
 assert.equal(pathOf(a),'/v/720/master.m3u8?id=7');assert.equal(pathOf(a),pathOf(b))
 assert.notEqual(pathOf(a),pathOf(via(4567,'https://cdn1.example.com/v/1080/master.m3u8?token=abc&id=7')))
 assert.notEqual(pathOf(a),pathOf(via(4567,'https://cdn1.example.com/v/720/master.m3u8?token=abc&id=8')),'a field that is not a token still tells two files apart')
 assert.equal(pathOf('http://127.0.0.1:1/seg?n=3'),'/seg?n=3');assert.equal(pathOf('not a link'),'not a link')
})
