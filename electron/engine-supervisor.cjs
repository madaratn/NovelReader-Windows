// The video engine (a Java program beside the app) takes a few seconds to start and
// can stop while the app runs: out of memory on a long session, closed by an
// antivirus, the PC back from sleep. A request that finds it down does not fail with
// "fetch failed": the engine is started again, the request waits until it answers
// (at most `waitMs`) and is sent once more.
//
// Only "nobody is listening" counts as down (connection refused or cut). An answer
// from the engine, even an error or a slow one (time-out), is passed on as it is.
const DOWN_CODES=new Set(['ECONNREFUSED','ECONNRESET','EPIPE','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'])
function engineDown(e){
 for(let x=e,i=0;x&&i<4;x=x.cause,i++){if(DOWN_CODES.has(x.code))return true}
 return /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|other side closed/i.test(String((e&&e.message)||e||''))
}

function createEngineSupervisor({request,health,isRunning,start,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,waitMs=30000,stepMs=400,maxStarts=3,log=()=>{}}){
 let waiting=null,off=false
 // Resolves when the engine answers; starts it when its process is gone. One wait at
 // a time: the requests that arrive meanwhile share it.
 function ready(){
  if(off)return Promise.reject(new Error('The video engine is stopped (the app is closing).'))
  if(waiting)return waiting
  waiting=(async()=>{
   const until=now()+waitMs;let starts=0
   for(;;){
    if(off)throw new Error('The video engine is stopped (the app is closing).')
    if(!isRunning()){
     if(starts>=maxStarts)throw new Error('The video engine stops as soon as it starts. Restart NovelReader; if it happens again, send a problem report from Settings.')
     starts++;log('starting the engine (try '+starts+')')
     if(start()===false)throw new Error('The video engine is not installed with this copy of NovelReader.')
    }
    try{await health();return true}catch(e){if(!engineDown(e))return true} // it answers (even badly): not down any more
    if(now()>=until)throw new Error('The video engine did not start within '+Math.round(waitMs/1000)+' s. Try again in a moment.')
    await sleep(stepMs)
   }
  })()
  const mine=waiting,clear=()=>{if(waiting===mine)waiting=null}
  mine.then(clear,clear)
  return mine
 }
 // A request to the engine; sent again once when the engine was down.
 async function call(pathname,init){
  try{return await request(pathname,init)}
  catch(e){
   if(off||!engineDown(e))throw e
   log('engine down on '+String(pathname).split('?')[0]+' ('+String((e&&e.message)||e)+'): waiting for it')
   await ready()
   return request(pathname,init)
  }
 }
 return{call,ready,stop:()=>{off=true},resume:()=>{off=false},get waiting(){return!!waiting}}
}

module.exports={createEngineSupervisor,engineDown}
