const fs=require('fs'),path=require('path'),https=require('https'),extract=require('extract-zip');
const root=path.join(__dirname,'..'),engine=path.join(root,'engine'),jar=path.join(engine,'miwayomi-all.jar'),jreDir=path.join(engine,'jre');
const MIWAYOMI_TAG=process.env.MIWAYOMI_TAG||null;
const MIWAYOMI_REPO=process.env.MIWAYOMI_REPO||'miwayomi/miwayomi';
const PATCHED_ENGINE_URL='https://github.com/madaratn/NovelReader-Windows/releases/download/miwayomi-v0.2.9-novelreader/miwayomi-all.jar';
const MIWAYOMI_ASSET_URL=process.env.MIWAYOMI_ASSET_URL||PATCHED_ENGINE_URL;
fs.mkdirSync(engine,{recursive:true});
function apiHeaders(url){const h={'User-Agent':'NovelReader-Build','Accept':'application/vnd.github+json'};const t=process.env.GITHUB_TOKEN;if(t&&new URL(url).hostname==='api.github.com')h.Authorization='Bearer '+t;return h}
function getJson(url){return new Promise((resolve,reject)=>https.get(url,{headers:apiHeaders(url)},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)return getJson(r.headers.location).then(resolve,reject);let b='';r.on('data',d=>b+=d);r.on('end',()=>{try{resolve(JSON.parse(b))}catch(e){reject(e)}})}).on('error',reject))}
function download(url,dest){return new Promise((resolve,reject)=>{const go=u=>https.get(u,{headers:{'User-Agent':'NovelReader-Build'}},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location)return go(r.headers.location);if(r.statusCode!==200)return reject(Error('Download HTTP '+r.statusCode));const f=fs.createWriteStream(dest);r.pipe(f);f.on('finish',()=>f.close(resolve));f.on('error',reject)}).on('error',reject);go(url)})}
(async()=>{console.log('Preparing bundled Anime engine…');
 let engineMeta;
 if(MIWAYOMI_ASSET_URL){
   console.log('Miwayomi custom engine asset selected.');
   await download(MIWAYOMI_ASSET_URL,jar);
   engineMeta={repo:MIWAYOMI_REPO,tag:MIWAYOMI_TAG||'v0.2.9-novelreader-stackframes',target:'NovelReader patched engine',asset:MIWAYOMI_ASSET_URL,downloadedAt:new Date().toISOString()};
 } else {
   const rel=await getJson(MIWAYOMI_TAG?'https://api.github.com/repos/'+MIWAYOMI_REPO+'/releases/tags/'+encodeURIComponent(MIWAYOMI_TAG):'https://api.github.com/repos/'+MIWAYOMI_REPO+'/releases/latest');
   if(!Array.isArray(rel.assets))throw Error('GitHub API error: '+(rel.message||JSON.stringify(rel).slice(0,200)));
   const asset=rel.assets.find(a=>a.name==='miwayomi-all.jar'); if(!asset)throw Error('Miwayomi JAR asset not found');
   console.log('Miwayomi release selected:',rel.tag_name,rel.target_commitish||'');
   await download(asset.browser_download_url,jar); console.log('Miwayomi '+rel.tag_name+' downloaded.');
   engineMeta={repo:MIWAYOMI_REPO,tag:rel.tag_name,target:rel.target_commitish||null,asset:asset.name,downloadedAt:new Date().toISOString()};
 }
 fs.writeFileSync(path.join(engine,'miwayomi-version.json'),JSON.stringify(engineMeta,null,2));
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
