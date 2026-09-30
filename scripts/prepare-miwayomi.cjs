const fs=require('fs'),path=require('path'),https=require('https'),extract=require('extract-zip');
const root=path.join(__dirname,'..'),engine=path.join(root,'engine'),jar=path.join(engine,'miwayomi-all.jar'),jreDir=path.join(engine,'jre');
const MIWAYOMI_TAG=process.env.MIWAYOMI_TAG||null;
const MIWAYOMI_REPO=process.env.MIWAYOMI_REPO||'miwayomi/miwayomi';
fs.mkdirSync(engine,{recursive:true});
function getJson(url){return new Promise((resolve,reject)=>https.get(url,{headers:{'User-Agent':'NovelReader-Build'}},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)return getJson(r.headers.location).then(resolve,reject);let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{resolve(JSON.parse(b))}catch(e){reject(e)}})}).on('error',reject))}
function download(url,dest){return new Promise((resolve,reject)=>{const go=u=>https.get(u,{headers:{'User-Agent':'NovelReader-Build'}},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)return go(r.headers.location);if(r.statusCode!==200)return reject(Error('Download HTTP '+r.statusCode));const f=fs.createWriteStream(dest);r.pipe(f);f.on('finish',()=>f.close(resolve));f.on('error',reject)}).on('error',reject);go(url)})}
(async()=>{console.log('Preparing bundled Anime engine…');
 const rel=await getJson(MIWAYOMI_TAG?'https://api.github.com/repos/'+MIWAYOMI_REPO+'/releases/tags/'+encodeURIComponent(MIWAYOMI_TAG):'https://api.github.com/repos/'+MIWAYOMI_REPO+'/releases/latest');
 const asset=rel.assets.find(a=>a.name==='miwayomi-all.jar'); if(!asset)throw Error('Miwayomi JAR asset not found');
 console.log('Miwayomi release selected:',rel.tag_name,rel.target_commitish||'');
 await download(asset.browser_download_url,jar); console.log('Miwayomi '+rel.tag_name+' downloaded.');
 fs.writeFileSync(path.join(engine,'miwayomi-version.json'),JSON.stringify({repo:MIWAYOMI_REPO,tag:rel.tag_name,target:rel.target_commitish||null,asset:asset.name,downloadedAt:new Date().toISOString()},null,2));
 if(!fs.existsSync(path.join(jreDir,'bin','java.exe'))){
  const tmp=path.join(engine,'temurin.zip');
  await download('https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse',tmp);
  const unpack=path.join(engine,'_jre'); fs.rmSync(unpack,{recursive:true,force:true}); await extract(tmp,{dir:unpack});
  const top=fs.readdirSync(unpack).map(x=>path.join(unpack,x)).find(x=>fs.statSync(x).isDirectory());
  fs.rmSync(jreDir,{recursive:true,force:true}); fs.renameSync(top,jreDir); fs.rmSync(unpack,{recursive:true,force:true}); fs.unlinkSync(tmp);
  console.log('Bundled Java 21 runtime downloaded.');
 }
 console.log('Anime engine ready.');
})().catch(e=>{console.error(e);process.exit(1)});
