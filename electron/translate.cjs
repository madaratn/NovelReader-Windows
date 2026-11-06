// Chapter translation through Google Translate's public web endpoint (the one the
// browser extension uses). Paragraphs are sent in batches (several q= per request)
// so each one comes back separately and the layout is kept.
const ENDPOINT='https://translate.googleapis.com/translate_a/t'
const cache=new Map() // `${to}\u0000${text}` -> translation (kept for this run)

function batches(texts,max=4500){const out=[];let cur=[],size=0;texts.forEach((t,i)=>{const n=encodeURIComponent(t).length;if(cur.length&&(size+n>max||cur.length>=60)){out.push(cur);cur=[];size=0}cur.push(i);size+=n});if(cur.length)out.push(cur);return out}
function parse(json,count){
 // Answers look like ["a","b"] or [["a","en"],["b","en"]], or a single string for one q.
 const list=Array.isArray(json)?json:[json]
 const out=list.map(x=>Array.isArray(x)?String(x[0]??''):String(x??''))
 if(out.length!==count)throw new Error('Unexpected translation answer')
 return out
}
async function translate({texts,to,from='auto'},fetchImpl=globalThis.fetch){
 const list=(texts||[]).map(x=>String(x||''));const target=String(to||'en').slice(0,10)
 const result=list.map(x=>x.trim()?cache.get(target+'\u0000'+x):x)
 const todo=list.map((x,i)=>i).filter(i=>result[i]===undefined)
 for(const group of batches(todo.map(i=>list[i]))){
  const idx=group.map(g=>todo[g]),body=new URLSearchParams();for(const i of idx)body.append('q',list[i])
  const url=ENDPOINT+'?client=gtx&sl='+encodeURIComponent(from)+'&tl='+encodeURIComponent(target)+'&format=html'
  let lastErr
  for(let attempt=0;attempt<3;attempt++){
   try{const r=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:body.toString()});if(r.status===429)throw Object.assign(new Error('Too many requests: wait a minute and try again'),{retry:true});if(!r.ok)throw new Error('HTTP '+r.status);const out=parse(await r.json(),idx.length);idx.forEach((i,k)=>{result[i]=out[k];cache.set(target+'\u0000'+list[i],out[k])});lastErr=null;break}
   catch(e){lastErr=e;await new Promise(res=>setTimeout(res,700*(attempt+1)))}
  }
  if(lastErr)throw lastErr
 }
 if(cache.size>5000)for(const k of [...cache.keys()].slice(0,1000))cache.delete(k)
 return result
}
module.exports={translate,batches,parse}
