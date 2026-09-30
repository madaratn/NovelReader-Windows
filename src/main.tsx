import React,{useEffect,useState}from'react'
import{createRoot}from'react-dom/client'
import'./style.css'
type Plugin={id:string,name:string,site:string,lang:string,version:string,url:string,iconUrl:string}
const MANIFEST='https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json'
function App(){
 const[page,setPage]=useState('library'),[plugins,setPlugins]=useState<Plugin[]>([]),[filter,setFilter]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState('')
 const load=async()=>{setLoading(true);setError('');try{const r=await fetch(MANIFEST);if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();setPlugins(Array.isArray(j)?j:(j.plugins||[]))}catch(e){setError(String(e))}finally{setLoading(false)}}
 useEffect(()=>{if(page==='sources'&&!plugins.length)load()},[page])
 const shown=plugins.filter(p=>(p.name+' '+p.lang).toLowerCase().includes(filter.toLowerCase()))
 return <div className="app"><aside><div className="brand">NOVEL<span>READER</span></div><button className={page==='library'?'active':''}onClick={()=>setPage('library')}>Library</button><button className={page==='search'?'active':''}onClick={()=>setPage('search')}>Global Search</button><button className={page==='sources'?'active':''}onClick={()=>setPage('sources')}>Sources</button><div className="grow"/><div className="version">Windows · v0.2 alpha</div></aside><main>
 {page==='library'&&<><header><div><h1>Your Library</h1><p>Continue reading and track new chapters.</p></div></header><section className="panel"><h2>V0.2 source engine</h2><p>The LNReader repository can now be loaded from Sources. Real plugin execution is the next isolated-host milestone.</p></section></>}
 {page==='search'&&<><header><div><h1>Global Search</h1><p>Multi-source novel search will use the sources you install.</p></div></header><section className="panel"><p>Source discovery is active. Plugin execution/search is intentionally disabled until the isolated host is connected.</p></section></>}
 {page==='sources'&&<><header><div><h1>Sources</h1><p>Official LNReader repository · {plugins.length||'—'} sources loaded</p></div><button className="primary"onClick={load}>{loading?'Refreshing…':'Refresh repository'}</button></header><div className="searchbar"><input placeholder="Filter sources or language…"value={filter}onChange={e=>setFilter(e.target.value)}/></div>{error&&<section className="panel"><p>Repository error: {error}</p></section>}<section className="sourcegrid">{shown.slice(0,300).map(p=><article className="sourcecard"key={p.id}><img src={p.iconUrl}/><div><b>{p.name}</b><small>{p.lang} · v{p.version}</small><small>{p.site}</small></div><button disabled title="Enabled after isolated plugin host is connected">Install</button></article>)}</section></>}
 </main></div>
}
createRoot(document.getElementById('root')!).render(<App/>)
