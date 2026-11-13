// Recognises a site's anti-bot check page (Cloudflare "Just a moment…", DDoS-Guard,
// Anubis, small cookie scripts). Same rules as electron/book-web.cjs.
//  'strict': a real check that may want a click (its window can be shown);
//  'script': a small page that only runs a script and reloads (no click needed).
export const CHALLENGE_TITLE=/just a moment|attention required|un instant|un momento|einen moment|ddos-guard|security check|checking your browser|проверка безопасности|please wait/i
const SCRIPT_TITLE=/^\s*(loading|redirecting|one moment|making sure you(&#39;|')re not a bot)/i
export function challengeKind(status:number,headers:{get(k:string):string|null}|null,text:string):''|'strict'|'script'{
 if(headers?.get?.('cf-mitigated')==='challenge')return'strict'
 const body=String(text||''),title=(body.match(/<title[^>]*>([^<]{0,120})/i)||[])[1]||''
 if([403,429,503].includes(status)&&(CHALLENGE_TITLE.test(title)||/challenge-platform|cf_chl_|ddos-guard/i.test(body.slice(0,20000))))return'strict'
 if(/making sure you(&#39;|')re not a bot/i.test(title))return'strict'
 if(body.length<12000&&(SCRIPT_TITLE.test(title)||/document\.cookie\s*=/.test(body)&&/location\.(href|reload|replace)/.test(body)))return'script'
 if(status===403&&body.length<200)return'script'
 return''}
