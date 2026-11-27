// src/lib/party-sync.ts: the maths that keep the players of a watch party together.
const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const esbuild = require('esbuild')
const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../../src/lib/party-sync.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' }).outputFiles[0].text
const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require)
const { ClockSync, posNow, driftFix, describeChange, clockTime, opusMusic, epKey, nameHue, DRIFT } = m.exports

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`)
const st = (o = {}) => ({ media: { sourceId: '42', url: '/s/1' }, episodeUrl: '/ep/1', playing: true, time: 100, rate: 1, ...o })

test('clock: the gap with the host comes from the round trip', () => {
  const c = new ClockSync()
  assert.equal(c.ready(1000), false)
  assert.equal(c.rtt(1000), null)
  // Host is 5 000 ms ahead; the message took 40 ms each way.
  c.sample(1000, 1000 + 40 + 5000, 1080)
  assert.equal(c.ready(1080), true)
  near(c.offset(1080), 5000)
  assert.equal(c.rtt(1080), 80)
})

test('clock: the quickest round trip wins (a slow one is lopsided)', () => {
  const c = new ClockSync()
  // Slow and lopsided: 300 ms out, 20 ms back; true gap 5 000.
  c.sample(0, 300 + 5000, 320)
  near(c.offset(320), 5140) // 140 ms wrong
  // Quick one: 10 ms each way.
  c.sample(3000, 3010 + 5000, 3020)
  near(c.offset(3020), 5000)
  assert.equal(c.rtt(3020), 20)
  // Another slow one does not spoil it.
  c.sample(6000, 6400 + 5000, 6410)
  near(c.offset(6410), 5000)
})

test('clock: nonsense is ignored, old measures are forgotten', () => {
  const c = new ClockSync()
  c.sample(1000, 6000, 900)      // answer before the question
  c.sample(1000, NaN, 1010)
  c.sample(1000, 6000, 20000)    // 19 s round trip
  assert.equal(c.ready(20000), false)
  c.sample(1000, 6000, 1010)
  assert.equal(c.ready(1010), true)
  assert.equal(c.ready(1010 + 121000), false) // two minutes without an answer
  for (let i = 0; i < 20; i++) c.sample(2000 + i * 3000, 7000 + i * 3000 + 50, 2100 + i * 3000)
  assert.equal(c.rtt(2100 + 19 * 3000), 100)
  c.reset()
  assert.equal(c.ready(2100 + 19 * 3000), false)
})

test('position now: exact with a dated position, guessed otherwise', () => {
  // Dated: 2.4 s ago on the host's clock.
  near(posNow(st({ at: 50_000 }), { hostNow: 52_400, recvAt: 0, now: 999 }), 102.4)
  near(posNow(st({ at: 50_000, rate: 1.5 }), { hostNow: 52_000, recvAt: 0, now: 0 }), 103)
  // Paused: the position itself.
  near(posNow(st({ at: 50_000, playing: false }), { hostNow: 99_000, recvAt: 0, now: 0 }), 100)
  // A clock a little behind never goes back in time.
  near(posNow(st({ at: 50_000 }), { hostNow: 49_900, recvAt: 0, now: 0 }), 100)
  // No date (older version) or no clock yet: arrival time + a quarter second.
  near(posNow(st(), { hostNow: 52_400, recvAt: 10_000, now: 12_000 }), 102.25)
  near(posNow(st({ at: 50_000 }), { hostNow: null, recvAt: 10_000, now: 10_000 }), 100.25)
})

test('drift: nothing for a tiny gap, a few percent of speed, a jump when far', () => {
  assert.deepEqual(driftFix(0.02, false), { jump: false, factor: 1 })
  assert.deepEqual(driftFix(0.06, false), { jump: false, factor: 1 }) // not started yet
  // Late by 0.1 s: a little faster.
  let f = driftFix(0.1, false); assert.equal(f.jump, false); near(f.factor, 1.05)
  // Early by 0.1 s: a little slower.
  f = driftFix(-0.1, false); near(f.factor, 0.95)
  // Never more than 6 %.
  near(driftFix(0.6, false).factor, 1 + DRIFT.max)
  near(driftFix(-0.9, false).factor, 1 - DRIFT.max)
  // Once correcting, it goes on until the gap is really small.
  near(driftFix(0.035, true).factor, 1 + DRIFT.min)
  near(driftFix(0.05, true).factor, 1.025)
  assert.equal(driftFix(0.02, true).factor, 1)
  // Far off: jump.
  assert.deepEqual(driftFix(1.2, true), { jump: true, factor: 1 })
  assert.deepEqual(driftFix(-3, false), { jump: true, factor: 1 })
  assert.deepEqual(driftFix(1.2, false, 1.5), { jump: false, factor: 1 + DRIFT.max })
  assert.deepEqual(driftFix(NaN, false), { jump: false, factor: 1 })
})

test('drift: following the rule closes a half second gap in a few seconds', () => {
  let gap = 0.5, correcting = false, t = 0
  while (t < 30) { const f = driftFix(gap, correcting); if (f.factor === 1) break; correcting = true; gap -= (f.factor - 1) * 0.25; t += 0.25 }
  assert.ok(Math.abs(gap) < DRIFT.ok + 1e-9, 'gap left: ' + gap)
  assert.ok(t > 5 && t < 11, 'took ' + t + ' s')
})

test('what someone did: said by recent versions, read from the difference otherwise', () => {
  const c = { hostNow: null, recvAt: 0, now: 0 }
  for (const w of ['play', 'pause', 'seek', 'episode', 'rate']) assert.equal(describeChange(st(), st({ why: w }), c), w)
  for (const w of ['hb', 'wait', 'resume', 'lock']) assert.equal(describeChange(st(), st({ why: w, playing: false, time: 500 }), c), '')
  // Older versions.
  assert.equal(describeChange(null, st(), c), 'episode')
  assert.equal(describeChange(st(), st({ episodeUrl: '/ep/2' }), c), 'episode')
  assert.equal(describeChange(st(), st({ playing: false }), c), 'pause')
  assert.equal(describeChange(st({ playing: false }), st(), c), 'play')
  assert.equal(describeChange(st(), st({ rate: 1.25 }), c), 'rate')
  assert.equal(describeChange(st(), st({ time: 400 }), c), 'seek')
  // A regular position report five seconds later is not an action.
  assert.equal(describeChange(st(), st({ time: 105.2 }), { hostNow: null, recvAt: 0, now: 5000 }), '')
})

test('small helpers', () => {
  assert.equal(clockTime(0), '0:00')
  assert.equal(clockTime(754.9), '12:34')
  assert.equal(clockTime(3723), '1:02:03')
  assert.equal(clockTime(NaN), '0:00')
  assert.equal(epKey(st()), '42|/s/1|/ep/1')
  assert.equal(epKey({ media: null, episodeUrl: '' }), '')
  assert.equal(epKey(null), '')
  assert.equal(nameHue('Ali'), nameHue('Ali'))
  assert.ok(nameHue('Ali') >= 0 && nameHue('Ali') < 360)
  assert.notEqual(nameHue('Ali'), nameHue('Sara'))
})

test('film sound over a call: stereo and a higher bitrate, the rest untouched', () => {
  const sdp = ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9', 'a=rtpmap:111 opus/48000/2', 'a=rtcp-fb:111 transport-cc', 'a=fmtp:111 minptime=10;useinbandfec=1', 'a=rtpmap:63 red/48000/2', 'a=fmtp:63 111/111', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=rtpmap:96 VP8/90000', ''].join('\r\n')
  const out = opusMusic(sdp).split('\r\n')
  assert.equal(out[4], 'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=160000')
  assert.equal(out[6], 'a=fmtp:63 111/111')
  assert.equal(out.length, sdp.split('\r\n').length)
  // Twice gives the same thing.
  assert.equal(opusMusic(opusMusic(sdp)), opusMusic(sdp))
  // An opus line without parameters gets them.
  const bare = ['m=audio 9 UDP/TLS/RTP/SAVPF 109', 'a=rtpmap:109 opus/48000/2', 'a=mid:0', ''].join('\r\n')
  assert.deepEqual(opusMusic(bare, 128000).split('\r\n'), ['m=audio 9 UDP/TLS/RTP/SAVPF 109', 'a=rtpmap:109 opus/48000/2', 'a=fmtp:109 stereo=1;sprop-stereo=1;maxaveragebitrate=128000', 'a=mid:0', ''])
  // No opus: unchanged.
  assert.equal(opusMusic('v=0\r\nm=video 9 X 96\r\n'), 'v=0\r\nm=video 9 X 96\r\n')
})
