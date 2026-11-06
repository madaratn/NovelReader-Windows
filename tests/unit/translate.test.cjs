const test=require('node:test')
const assert=require('node:assert')
const {translate,batches,parse}=require('../../electron/translate.cjs')

test('parse accepts the answer shapes of the endpoint',()=>{
 assert.deepEqual(parse(['a','b'],2),['a','b'])
 assert.deepEqual(parse([['a','en'],['b','en']],2),['a','b'])
 assert.deepEqual(parse('a',1),['a'])
 assert.throws(()=>parse(['a'],2))
})
test('batches split by size and count',()=>{
 assert.deepEqual(batches(['x'.repeat(3000),'y'.repeat(3000),'z']),[[0],[1,2]])
 assert.equal(batches(Array(130).fill('a')).length,3)
})
test('translate keeps order, skips blanks, caches, retries',async()=>{
 const calls=[];let fail=1
 const fake=async(url,opt)=>{calls.push({url,body:opt.body});if(fail-->0)return{ok:false,status:503};const qs=new URLSearchParams(opt.body).getAll('q');return{ok:true,status:200,json:async()=>qs.map(q=>[q.toUpperCase(),'en'])}}
 const out=await translate({texts:['hello','',' world <b>x</b>'],to:'fr'},fake)
 assert.deepEqual(out,['HELLO','',' WORLD <B>X</B>'])
 assert.match(calls[1].url,/tl=fr/);assert.equal(new URLSearchParams(calls[1].body).getAll('q').length,2)
 const again=await translate({texts:['hello'],to:'fr'},fake)
 assert.deepEqual(again,['HELLO']);assert.equal(calls.length,2)
})
