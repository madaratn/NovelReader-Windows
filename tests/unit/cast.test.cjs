const test=require('node:test')
const assert=require('node:assert')
const http=require('http')
const {createCast,createRelay,parseDescription,soapBody,didl,mimeOf}=require('../../electron/cast.cjs')

const DESC=`<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><device><friendlyName>[TV] Samsung 7 Series &amp; co</friendlyName><UDN>uuid:abc</UDN><serviceList>
<service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>/upnp/control/RenderingControl1</controlURL></service>
<service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/upnp/control/AVTransport1</controlURL></service>
</serviceList></device></root>`

test('cast: DLNA description, SOAP and metadata',()=>{
 const d=parseDescription(DESC,'http://192.168.1.20:9197/dmr')
 assert.deepEqual(d,{kind:'dlna',id:'dlna:uuid:abc',name:'[TV] Samsung 7 Series & co',host:'192.168.1.20',avType:'urn:schemas-upnp-org:service:AVTransport:1',avControl:'http://192.168.1.20:9197/upnp/control/AVTransport1',rcType:'urn:schemas-upnp-org:service:RenderingControl:1',rcControl:'http://192.168.1.20:9197/upnp/control/RenderingControl1'})
 assert.equal(parseDescription('<root><device><friendlyName>Speaker</friendlyName></device></root>','http://1.2.3.4/'),null) // no AVTransport: not a video renderer
 const b=soapBody('urn:x:AVTransport:1','Seek',{InstanceID:0,Unit:'REL_TIME',Target:'00:01:30'})
 assert.match(b,/<u:Seek xmlns:u="urn:x:AVTransport:1"><InstanceID>0<\/InstanceID><Unit>REL_TIME<\/Unit><Target>00:01:30<\/Target><\/u:Seek>/)
 assert.match(didl('http://a/b?x=1&y=2','Tom & Jerry','video/mp4'),/<dc:title>Tom &amp; Jerry<\/dc:title>.*>http:\/\/a\/b\?x=1&amp;y=2<\/res>/)
 assert.equal(mimeOf('http://127.0.0.1:4567/api/v1/hls?url=x'),'application/x-mpegURL')
 assert.equal(mimeOf('http://127.0.0.1:4567/api/v1/proxy?url='+encodeURIComponent('https://h/f.mkv')),'video/x-matroska')
 assert.equal(mimeOf('http://127.0.0.1:4567/api/v1/proxy?url=x'),'video/mp4')
})

function upstream(){return new Promise(r=>{const body=Buffer.alloc(1000,7);const s=http.createServer((req,res)=>{
 if(req.url.startsWith('/api/v1/hls')){res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'});res.end(`#EXTM3U\n#EXTINF:4,\nhttp://127.0.0.1:${s.address().port}/api/v1/hls?url=seg1\n`);return}
 const m=/bytes=(\d+)-/.exec(req.headers.range||'');if(m){const a=+m[1];res.writeHead(206,{'Content-Type':'video/mp4','Content-Range':`bytes ${a}-999/1000`,'Content-Length':1000-a});res.end(body.subarray(a));return}
 res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':1000});res.end(body)});s.listen(0,'127.0.0.1',()=>r(s))})}

test('cast: the relay lets the TV reach the local engine (ranges, HLS playlists), nothing else',async()=>{
 const up=await upstream(),p=up.address().port,relay=createRelay()
 try{
  await relay.start()
  const lan=relay.toLan(`http://127.0.0.1:${p}/api/v1/proxy?url=x`,'127.0.0.1')
  assert.match(lan,new RegExp(`^http://127\\.0\\.0\\.1:${relay.port()}/t/[0-9a-f]{24}/${p}/api/v1/proxy\\?url=x$`))
  const r=await fetch(lan,{headers:{range:'bytes=600-'}})
  assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 600-999/1000');assert.equal((await r.arrayBuffer()).byteLength,400)
  assert.equal(r.headers.get('accept-ranges'),'bytes');assert.equal(r.headers.get('access-control-allow-origin'),'*')
  const list=await (await fetch(relay.toLan(`http://127.0.0.1:${p}/api/v1/hls?url=m`,'127.0.0.1'))).text()
  assert.match(list,new RegExp(`/t/${relay.token}/${p}/api/v1/hls\\?url=seg1`))
  assert.ok(!list.includes(`http://127.0.0.1:${p}/api`))
  assert.equal((await fetch(lan.replace(relay.token,'0'.repeat(24)))).status,404) // wrong token
  assert.equal((await fetch(lan.replace(`/${p}/`,'/22/'))).status,404) // port not being cast
 }finally{relay.close();up.close()}
})

test('cast: DLNA TV gets the relayed URL, play, seek to where the PC was, status',async()=>{
 const calls=[]
 const fetchImpl=async(url,opt)=>{const action=/#(\w+)"/.exec(opt.headers.SOAPAction)[1];calls.push({action,body:opt.body})
  const reply=action==='GetPositionInfo'?'<RelTime>00:01:05</RelTime><TrackDuration>00:24:00</TrackDuration>':action==='GetTransportInfo'?'<CurrentTransportState>PLAYING</CurrentTransportState>':''
  return{ok:true,status:200,text:async()=>reply}}
 const d=parseDescription(DESC,'http://192.168.1.20:9197/dmr')
 const cast=createCast({fetchImpl,discover:async()=>[d]})
 try{
  const list=await cast.scan();assert.deepEqual(list,[{id:d.id,name:d.name,kind:'dlna',host:'192.168.1.20'}])
  const r=await cast.start({deviceId:d.id,url:'http://127.0.0.1:4567/api/v1/proxy?url=a.mp4',title:'Naruto E1',startAt:90})
  assert.equal(r.device.name,d.name);assert.match(r.url,/\/t\/[0-9a-f]+\/4567\/api\/v1\/proxy\?url=a\.mp4$/)
  assert.deepEqual(calls.map(c=>c.action),['Stop','SetAVTransportURI','Play','Seek'])
  assert.match(calls[1].body,/<CurrentURI>http:\/\/[\d.]+:\d+\/t\//);assert.match(calls[1].body,/Naruto E1/)
  assert.match(calls[3].body,/<Target>00:01:30<\/Target>/)
  assert.deepEqual(await cast.status(),{time:65,duration:1440,playing:true,state:'playing'})
  await cast.control('pause');await cast.control('volume',0.4)
  assert.equal(calls.at(-2).action,'Pause');assert.match(calls.at(-1).body,/<DesiredVolume>40<\/DesiredVolume>/)
  await cast.stop();assert.equal(await cast.status(),null)
 }finally{cast.close()}
})

test('cast: Chromecast gets the stream, its type, the start time and the subtitles',async()=>{
 const seen={}
 class Client{on(){}connect(o,cb){seen.connect=o;cb()}launch(app,cb){cb(null,{load(media,opts,cb2){seen.media=media;seen.opts=opts;cb2(null,{})},getStatus(cb3){cb3(null,{currentTime:12,playerState:'PLAYING',media:{duration:100}})},stop(cb4){seen.stopped=true;cb4()}})}setVolume(v,cb){seen.vol=v.level;cb()}close(){seen.closed=true}}
 const cast=createCast({clientFactory:()=>({Client,DefaultMediaReceiver:{}}),discover:async()=>[{kind:'cast',id:'cast:x',name:'Salon TV',host:'192.168.1.30',port:8009}]})
 try{
  await cast.scan()
  await cast.start({deviceId:'cast:x',url:'http://127.0.0.1:4567/api/v1/hls?url=m',title:'Frieren',startAt:42,subtitles:[{url:'http://127.0.0.1:4567/api/v1/proxy?url=en.vtt',lang:'en',label:'English'}]})
  assert.deepEqual(seen.connect,{host:'192.168.1.30',port:8009})
  assert.equal(seen.media.contentType,'application/x-mpegURL');assert.equal(seen.media.metadata.title,'Frieren')
  assert.match(seen.media.contentId,/\/t\/[0-9a-f]+\/4567\/api\/v1\/hls/);assert.match(seen.media.tracks[0].trackContentId,/\/t\/[0-9a-f]+\/4567\/api\/v1\/proxy\?url=en\.vtt/)
  assert.equal(seen.opts.currentTime,42);assert.deepEqual(seen.opts.activeTrackIds,[1])
  assert.deepEqual(await cast.status(),{time:12,duration:100,playing:true,state:'playing'})
  await cast.control('volume',0.5);assert.equal(seen.vol,0.5)
  await cast.stop();assert.ok(seen.stopped&&seen.closed)
  await assert.rejects(cast.start({deviceId:'nope',url:'x',title:'y'}),/no longer found/)
 }finally{cast.close()}
})
