// Offline video downloads: HLS (master + audio rendition + key), direct files,
// fallback to the next stream, local server with ranges, removal.
const test=require('node:test')
const assert=require('node:assert')
const fs=require('fs')
const os=require('os')
const path=require('path')
const http=require('http')
const {createVideoDownloads}=require('../../electron/video-downloads.cjs')

function engine(){
 const hits=[]
 const routes={
  '/master.m3u8':'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Japanese",LANGUAGE="ja",DEFAULT=YES,URI="audio/ja.m3u8"\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="EN",URI="subs.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x720,AUDIO="aud",SUBTITLES="subs"\nv720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=3840x2160,AUDIO="aud"\nv2160.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360,AUDIO="aud"\nv360.m3u8\n',
  '/v720.m3u8':'#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-KEY:METHOD=AES-128,URI="/key?id=1"\n#EXTINF:4,\nseg?n=1\n#EXTINF:4,\nseg?n=2\n#EXTINF:4,\nhttp://127.0.0.1:PORT/seg?n=3\n#EXT-X-ENDLIST\n',
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
  assert.equal(job.file,'index.m3u8');assert.equal(job.title,'Server - 720p')
  const dir=path.join(root,id),master=fs.readFileSync(path.join(dir,'index.m3u8'),'utf8')
  assert.match(master,/URI="a0_index\.m3u8"/);assert.match(master,/RESOLUTION=1280x720/);assert.doesNotMatch(master,/SUBTITLES/);assert.match(master,/vindex\.m3u8/)
  const v=fs.readFileSync(path.join(dir,'vindex.m3u8'),'utf8')
  assert.match(v,/URI="v0\.key"/);assert.deepEqual(v.split('\n').filter(l=>l&&!l.startsWith('#')),['v1.ts','v2.ts','v3.ts'])
  assert.equal(fs.readFileSync(path.join(dir,'v3.ts'),'utf8'),'SEGMENT3')
  assert.equal(fs.readFileSync(path.join(dir,'a0_1.aac'),'utf8'),'AAC2')
  assert.deepEqual(job.subtitles,[{label:'English',lang:'',file:'sub0.vtt'}])
  assert.ok(job.size>0)
  // Served locally with ranges, meta.json and paths outside the folder refused
  const b=await dl.base()
  assert.equal(await (await fetch(b+'/'+id+'/v1.ts')).text(),'SEGMENT1')
  const r=await fetch(b+'/'+id+'/v1.ts',{headers:{Range:'bytes=2-4'}});assert.equal(r.status,206);assert.equal(await r.text(),'GME')
  assert.equal((await fetch(b+'/'+id+'/meta.json')).status,403)
  assert.equal((await fetch(b+'/..%2F..%2Fetc%2Fpasswd')).status,403)
  assert.equal(dl.usage().count,1)
  dl.remove(id);assert.equal(dl.list().length,0);assert.ok(!fs.existsSync(dir))
 }finally{dl.close();server.close()}
})

test('direct file download, and an error when no stream works',async()=>{
 const {server,base}=await engine(),root=fs.mkdtempSync(path.join(os.tmpdir(),'nr-dl-'))
 const dl=createVideoDownloads({root})
 try{
  const a=dl.start({kind:'movie',mediaId:'m1',episodeUrl:'/movie',candidates:[{url:base+'/movie.mp4',type:'file'}]})
  const ok=await waitDone(dl,a.id);assert.equal(ok.state,'done');assert.equal(ok.file,'video.mp4');assert.equal(fs.statSync(path.join(root,a.id,'video.mp4')).size,800)
  const b=dl.start({kind:'movie',mediaId:'m2',episodeUrl:'/movie',candidates:[{url:base+'/broken.m3u8',type:'hls'}]})
  const bad=await waitDone(dl,b.id);assert.equal(bad.state,'error');assert.match(bad.error,/HTTP 500/)
  assert.throws(()=>dl.start({kind:'movie',mediaId:'m3',episodeUrl:'/x',candidates:[{url:'https://evil.test/x.mp4',type:'file'}]}),/no stream/)
  dl.clear();assert.equal(dl.list().length,0)
 }finally{dl.close();server.close()}
})
