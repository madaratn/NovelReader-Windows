import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

type Book = { title:string; author:string; chapter:number; total:number; progress:number; updates:number }
const books: Book[] = [
  { title:'Shadow Slave', author:'Guiltythree', chapter:1530, total:1534, progress:64, updates:4 },
  { title:'My Imported Novel', author:'Local EPUB', chapter:42, total:120, progress:35, updates:0 }
]

function App(){
  const [page,setPage]=useState<'library'|'sources'|'reader'>('library')
  const [current,setCurrent]=useState(books[0])
  return <div className="app">
    <aside>
      <div className="brand">NOVEL<span>READER</span></div>
      <button className={page==='library'?'active':''} onClick={()=>setPage('library')}>Library</button>
      <button className={page==='sources'?'active':''} onClick={()=>setPage('sources')}>Sources</button>
      <div className="grow"/>
      <div className="version">Windows · v0.1</div>
    </aside>
    <main>
      {page==='library' && <>
        <header><div><h1>Your Library</h1><p>Continue reading and track new chapters.</p></div><button className="primary">+ Import book</button></header>
        <section className="grid">
          {books.map(b=><article className="card" key={b.title}>
            <div className="cover">{b.title.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
            <div className="meta">
              <div className="row"><h2>{b.title}</h2>{b.updates>0&&<span className="badge">+{b.updates} NEW</span>}</div>
              <p>{b.author}</p><p>Chapter {b.chapter} / {b.total}</p>
              <div className="bar"><i style={{width:b.progress+'%'}}/></div>
              <button className="primary" onClick={()=>{setCurrent(b);setPage('reader')}}>Continue</button>
            </div>
          </article>)}
        </section>
      </>}
      {page==='sources' && <>
        <header><div><h1>Sources</h1><p>Source extensions will power search and chapter updates.</p></div><button className="primary">Check updates</button></header>
        <section className="panel"><h2>Installed</h2><div className="source"><b>Local EPUB / TXT</b><span>Enabled</span></div><div className="source"><b>LNReader adapter</b><span>Planned for v0.2</span></div></section>
        <section className="panel"><h2>Next</h2><p>Global search → installed sources → merged results → add to library → detect new chapters.</p></section>
      </>}
      {page==='reader' && <div className="reader">
        <button onClick={()=>setPage('library')}>← Library</button>
        <div className="readerHead"><span>{current.title}</span><span>Chapter {current.chapter}</span></div>
        <h1>Chapter {current.chapter}</h1>
        <p>This is the v0.1 reader preview. In v0.2, chapter content will come from imported books or an enabled source extension.</p>
        <p>Your reading position will be stored locally and synchronized with the library progress.</p>
      </div>}
    </main>
  </div>
}
createRoot(document.getElementById('root')!).render(<App />)
