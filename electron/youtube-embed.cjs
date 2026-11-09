// YouTube's embedded player refuses to play without a referring site (error 153),
// and the interface is loaded from a file: give YouTube's requests one. Only the
// YouTube player and its video servers are concerned (Tunisian TV source).
const REFERER = 'https://novelreader.app/'
const URLS = ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*', 'https://*.googlevideo.com/*', 'https://*.ytimg.com/*']

function installYouTubeReferer(ses) {
  ses.webRequest.onBeforeSendHeaders({ urls: URLS }, (details, callback) => {
    const h = details.requestHeaders
    if (!h.Referer && !h.referer) h.Referer = REFERER
    callback({ requestHeaders: h })
  })
}

module.exports = { installYouTubeReferer, REFERER }
