// electron/profiles.cjs: parent code and kids profiles.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs'), os = require('os'), path = require('path')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-pf-'))
const app = { getPath: () => dir }
const profiles = require('../../electron/profiles.cjs').init(app)

test('the code is stored hashed, checked, and needed to change kids settings', () => {
  const kid = profiles.create('Sam')
  assert.throws(() => profiles.parental({ id: kid.id, kids: true }), /parent code first/)
  profiles.parental({ newPin: '1234' })
  const saved = fs.readFileSync(path.join(dir, 'profiles.json'), 'utf8')
  assert.ok(!saved.includes('1234'), 'the code is not written in clear')
  assert.strictEqual(profiles.hasPin(), true)
  assert.strictEqual(profiles.checkPin('1234'), true)
  assert.strictEqual(profiles.checkPin('0000'), false)
  assert.throws(() => profiles.parental({ pin: '9999', id: kid.id, kids: true }), /Wrong parent code/)
  profiles.parental({ pin: '1234', id: kid.id, kids: true, genres: ['Animation'] })
  assert.deepStrictEqual(profiles.list().find(p => p.id === kid.id).genres, ['Animation'])
  assert.throws(() => profiles.parental({ pin: '1234', id: 'default', kids: true }), /first profile/)
  assert.throws(() => profiles.parental({ pin: '1234', newPin: '12' }), /4 to 8 digits/)
})

test('leaving a kids profile needs the code; five wrong codes wait 30 seconds', () => {
  const kid = profiles.list().find(p => p.kids)
  profiles.select(kid.id)
  assert.strictEqual(profiles.guarded(), true)
  assert.throws(() => profiles.needPin('1111'), /Wrong/)
  for (let i = 0; i < 4; i++) profiles.checkPin('1111')
  assert.throws(() => profiles.checkPin('1234'), /30 seconds/)
})

test('removing the code turns kids profiles back into ordinary ones', async () => {
  // (the 30-second wait from the previous test is skipped by a fresh module)
  delete require.cache[require.resolve('../../electron/profiles.cjs')]
  const p2 = require('../../electron/profiles.cjs').init(app)
  p2.parental({ pin: '1234', newPin: '' })
  assert.strictEqual(p2.hasPin(), false)
  assert.ok(p2.list().every(p => !p.kids))
})
