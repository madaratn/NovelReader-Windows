// Why a video source fails, in plain words, and what to do about it.
// Input: the technical message of a check (engine error, "no stream", HTTP code…).
import{t}from'../i18n'
export type Advice={why:string,fix:string,remove?:boolean}
export function sourceAdvice(msg:string,phone=false):Advice|null{
 const m=String(msg||'')
 if(!m.trim())return null
 if(/cloudflare|just a moment|challenge|ddos-guard|captcha/i.test(m))return{why:t('The site checks that visitors are not robots (Cloudflare).'),fix:phone?t('Try it on the PC, where the check can be passed.'):t('Turn on the Cloudflare protection (Sources › Advanced), then test again.')}
 if(/unknownhost|name or service not known|enotfound|could not resolve|dns/i.test(m))return{why:t('The site no longer exists (its address does not answer).'),fix:t('Remove this source.'),remove:true}
 if(/\b(401)\b|api.?key|token|login|log in|sign in|account|credential|preference|configure|settings/i.test(m))return{why:t('This source needs an account or a key from its site.'),fix:t('Fill it in the source\'s settings, or remove the source if you have none.')}
 if(/\b451\b/.test(m))return{why:t('The site is blocked in your country.'),fix:t('Use another source.')}
 if(/\b(403|441)\b|forbidden|blocked|refus/i.test(m))return{why:t('The site refuses the app for now.'),fix:t('Try again later; if it lasts, use another source.')}
 if(/timeout|timed out|too slow|etimedout|socket/i.test(m))return{why:t('The site is too slow or does not answer.'),fix:t('Try again later; if it lasts, remove the source.')}
 if(/\b5\d\d\b|bad gateway|service unavailable|internal server/i.test(m))return{why:t('The site is down for the moment.'),fix:t('Try again later.')}
 if(/ssl|certificate|handshake|cert_/i.test(m))return{why:t('The site\'s security certificate is not valid.'),fix:t('Wait for the site to fix it, or remove the source.')}
 if(/no stream|0 stream|no video|returned 0|none playable|hoster/i.test(m))return{why:t('The site lists the titles but gives no video (its video hosts are down or changed).'),fix:t('Watch from another source: NovelReader tries the others by itself when you press Play.')}
 if(/list empty|empty list|no result|0 result|nothing found|parse|selector|no episode/i.test(m))return{why:t('The site changed and the source no longer reads it.'),fix:t('Wait for an update of the source (Sources › Advanced › Updates), or remove it.')}
 return{why:t('The source did not work during the check.'),fix:t('Test it again later; if it keeps failing, remove it.')}}
