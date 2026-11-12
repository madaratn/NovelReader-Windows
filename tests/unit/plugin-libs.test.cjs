const test = require('node:test')
const assert = require('node:assert')
const http = require('node:http')

// A book source written like the LNReader ones: filters declared with FilterTypes
// when it loads, its own store (storage.get / set), statuses from NovelStatus.
const SOURCE = `"use strict";Object.defineProperty(exports,"__esModule",{value:!0});
var f=require("@libs/fetch"),fi=require("@libs/filterInputs"),ns=require("@libs/novelStatus"),st=require("@libs/storage"),c=require("cheerio");
var P=function(){function P(){this.id="t";this.name="T";this.site="SITE";this.version="1.0.0";
 this.filters={sort:{label:"Sort",value:"new",options:[{label:"New",value:"new"}],type:fi.FilterTypes.Picker},
  genres:{label:"Genres",value:[],options:[],type:fi.FilterTypes.CheckboxGroup}}}
 P.prototype.popularNovels=async function(page,o){st.storage.set("seen",(st.storage.get("seen")||0)+1);
  var h=await (await f.fetchApi(this.site+"/list?sort="+o.filters.sort.value)).text(),$=c.load(h);
  return $("a").map(function(){return{name:$(this).text(),path:$(this).attr("href")}}).get()};
 P.prototype.parseNovel=async function(p){return{path:p,name:"N",status:ns.NovelStatus.Ongoing,chapters:[{name:"C1",path:"/c/1"}]}};
 P.prototype.parseChapter=async function(p){return "<p>"+"text ".repeat(60)+"</p> seen "+st.storage.get("seen")};
 return P}();exports.default=new P();`

test('book sources: LNReader filter types, storage and statuses are there (PC runner)', async () => {
  const site = http.createServer((req, res) => {
    if (req.url.startsWith('/list?sort=new')) return res.end('<a href="/n/1">One</a><a href="/n/2">Two</a>')
    res.statusCode = 404; res.end()
  })
  await new Promise(r => site.listen(0, '127.0.0.1', r))
  const base = 'http://127.0.0.1:' + site.address().port
  const policy = require('../../electron/book-plugin-policy.cjs')
  const url = policy.TRUSTED_BOOK_PLUGIN_PREFIX + 'english/test.js'
  const realFetch = global.fetch
  global.fetch = async (u, o) => u === url ? new Response(SOURCE.replace('SITE', base), { status: 200 }) : realFetch(u, o)
  try {
    const runner = require('../../electron/plugin-runner.cjs')
    const plugin = { id: 't', name: 'T', url }
    // A source may not reach this PC (see the last test): the test site is served
    // through a stand-in for the app's Chromium fetch.
    runner.configure({ fetch: (u, o) => realFetch(u, o) })
    const list = await runner.popular(plugin, { page: 1 })
    assert.deepEqual(list.map(x => x.name), ['One', 'Two'])
    const novel = await runner.parseNovel(plugin, '/n/1')
    assert.equal(novel.status, 'Ongoing')
    const html = await runner.parseChapter(plugin, '/c/1')
    assert.match(html, /seen 1$/) // the store kept the value set while listing
  } finally { global.fetch = realFetch; require('../../electron/plugin-runner.cjs').configure(null); site.close() }
})

test('book sources may only reach web sites (no file, no local network)', () => {
  const { allowedBookUrl: ok } = require('../../electron/book-web.cjs')
  assert.equal(ok('https://www.royalroad.com/fictions'), true)
  for (const u of ['file:///C:/Users/me/secret.txt', 'http://127.0.0.1:4567/api/v1/sources', 'http://localhost:4580/', 'http://192.168.1.5:4580/abc', 'http://10.0.0.1/', 'http://172.20.0.1/', 'http://[::1]/', 'data:text/html,x', 'javascript:alert(1)', 'not a url'])
    assert.equal(ok(u), false, u)
})
