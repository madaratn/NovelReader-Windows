// Loading screen while NovelReader starts: a small window appears at once (only
// when the start takes more than a moment) and closes when the interface has
// drawn itself, so a slow start never looks like nothing is happening.
const path=require('path')
const fs=require('fs')

const TEXT={
 fr:{title:'NovelReader',loading:'Ouverture…',slow:'Encore un instant, la bibliothèque se prépare…'},
 en:{title:'NovelReader',loading:'Opening…',slow:'One moment, getting your library ready…'},
 ar:{title:'NovelReader',loading:'جارٍ الفتح…',slow:'لحظة، يتم تجهيز مكتبتك…'},
 es:{title:'NovelReader',loading:'Abriendo…',slow:'Un momento, preparando tu biblioteca…'}
}
function splashHtml(lang,icon){
 const t=TEXT[lang]||TEXT.en,rtl=lang==='ar'
 return `<!doctype html><html lang="${lang}" dir="${rtl?'rtl':'ltr'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
html,body{margin:0;height:100%;background:#0b0c10;color:#e6e8ef;font:14px "Segoe UI",system-ui,sans-serif;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-app-region:drag}
.box{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;border:1px solid #23283a;box-sizing:border-box;border-radius:14px;background:radial-gradient(circle at 50% 30%,#1a1f30,#0b0c10 70%)}
img{width:72px;height:72px;border-radius:16px;animation:pulse 1.6s ease-in-out infinite}
h1{margin:0;font-size:22px;letter-spacing:.3px}
.bar{width:220px;height:4px;border-radius:4px;background:#23283a;overflow:hidden}
.bar i{display:block;width:40%;height:100%;border-radius:4px;background:linear-gradient(90deg,#7b6cff,#a99cff);animation:slide 1.2s ease-in-out infinite}
p{margin:0;color:#9aa0b4;min-height:18px;text-align:center;padding:0 20px}
@keyframes slide{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}
@keyframes pulse{50%{transform:scale(1.06)}}
@media (prefers-reduced-motion:reduce){img,.bar i{animation:none}}
</style></head><body><div class="box">${icon?`<img src="${icon}" alt="">`:''}<h1>${t.title}</h1><div class="bar"><i></i></div><p id="m">${t.loading}</p></div>
<script>setTimeout(function(){document.getElementById('m').textContent=${JSON.stringify(t.slow)}},6000)</script></body></html>`
}
function createSplash({BrowserWindow,app,delay=350,iconPath=path.join(__dirname,'icon.png')}){
 let win=null,done=false,timer=null
 const lang=String(app.getLocale?.()||'en').slice(0,2)
 function show(){
  if(done||win)return
  let icon='';try{icon='data:image/png;base64,'+fs.readFileSync(iconPath).toString('base64')}catch{}
  win=new BrowserWindow({width:380,height:280,frame:false,resizable:false,movable:true,show:false,center:true,backgroundColor:'#0b0c10',title:'NovelReader',icon:iconPath,skipTaskbar:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,javascript:true}})
  win.setMenuBarVisibility?.(false)
  win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(splashHtml(lang,icon)))
  win.once('ready-to-show',()=>{if(!done&&win&&!win.isDestroyed())win.show()})
  win.on('closed',()=>{win=null})
 }
 return{
  start(){if(!done&&!timer)timer=setTimeout(show,delay)},
  // The interface is up: the loading screen goes away.
  finish(){done=true;clearTimeout(timer);if(win&&!win.isDestroyed()){const w=win;setTimeout(()=>{try{w.destroy()}catch{}},150)}win=null},
  isShowing:()=>!!win,
  isWindow:wc=>!!win&&!win.isDestroyed()&&win.webContents===wc
 }
}
module.exports={createSplash,splashHtml}
