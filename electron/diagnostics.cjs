// Problem report: keeps the last lines the main process logged and builds a
// diagnostic bundle (versions, engine state, logs) for "Report a problem".
// Personal paths and secrets in URLs are masked before anything leaves the app.
const os=require('os')
const fs=require('fs')
const path=require('path')

const MAX=400
const lines=[]
let installed=false
function capture(){
 if(installed)return;installed=true
 for(const level of ['log','info','warn','error']){
  const orig=console[level].bind(console)
  console[level]=(...args)=>{try{const text=args.map(a=>a instanceof Error?(a.stack||a.message):typeof a==='string'?a:(()=>{try{return JSON.stringify(a)}catch{return String(a)}})()).join(' ');lines.push({time:new Date().toISOString(),level,line:text.slice(0,2000)});if(lines.length>MAX)lines.splice(0,lines.length-MAX)}catch{}orig(...args)}
 }
 process.on('uncaughtException',e=>console.error('[uncaught]',e))
 process.on('unhandledRejection',e=>console.error('[unhandled rejection]',e))
}
// Mask the user's home folder / name and secrets that some sources put in URLs.
function redact(text){
 let s=String(text||'')
 const home=os.homedir(),user=(()=>{try{return os.userInfo().username}catch{return''}})()
 if(home){s=s.split(home).join('~');s=s.split(home.replace(/\\/g,'/')).join('~');s=s.split(home.replace(/\\/g,'\\\\')).join('~')}
 if(user&&user.length>2)s=s.replace(new RegExp('\\b'+user.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','gi'),'<user>')
 s=s.replace(/([?&](?:token|key|apikey|api_key|auth|signature|sig|session|password|pass|cookie|access_token)=)[^&\s"']+/gi,'$1***')
 s=s.replace(/(authorization|cookie)(["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^"',}\s]+/gi,'$1$2***')
 return s
}
function collect({app,engineRoot,engineLogs,engineRunning}){
 let engine=null;try{engine=JSON.parse(fs.readFileSync(path.join(engineRoot,'miwayomi-version.json'),'utf8'))}catch{}
 const data={
  app:app.getVersion(),electron:process.versions.electron,chrome:process.versions.chrome,node:process.versions.node,
  os:os.type()+' '+os.release()+' '+os.arch(),locale:(()=>{try{return app.getLocale()}catch{return''}})(),
  memoryMB:Math.round(os.totalmem()/1048576),freeMB:Math.round(os.freemem()/1048576),uptimeMin:Math.round(process.uptime()/60),
  engine:{running:Boolean(engineRunning),tag:engine&&engine.tag||'',downloadedAt:engine&&engine.downloadedAt||''},
  mainLogs:lines.slice(-250).map(x=>x.time.slice(11,19)+' '+x.level.toUpperCase()+' '+x.line),
  engineLogs:(engineLogs||[]).slice(-250).map(x=>String(x.time||'').slice(11,19)+' '+(x.kind==='stderr'?'ERR ':'')+x.line)
 }
 return JSON.parse(redact(JSON.stringify(data)))
}
module.exports={capture,collect,redact}
