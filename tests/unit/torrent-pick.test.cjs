const test=require('node:test')
const assert=require('node:assert')
const {pickFile}=require('../../electron/torrent-manager.cjs')

test('torrent: the episode file of a season pack (Torrentio index), else the main video',()=>{
 const f=(name,length)=>({name,path:'Pack/'+name,length})
 const t={files:[f('Deep.in.Love.S01E01.mkv',9e8),f('sample.mkv',1e7),f('Deep.in.Love.S01E02.mkv',9.5e8),f('readme.txt',10),f('Deep.in.Love.S01E03.mp4',8e8)]}
 assert.equal(pickFile(t,undefined,2).name,'Deep.in.Love.S01E02.mkv')
 assert.equal(pickFile(t,undefined,3).name,'Deep.in.Love.S01E03.mp4') // index of a non-video: the usual choice (mp4 first)
 assert.equal(pickFile(t,undefined,null).name,'Deep.in.Love.S01E03.mp4')
 assert.equal(pickFile(t,'Deep.in.Love.S01E01.mkv',2).name,'Deep.in.Love.S01E02.mkv')
})
