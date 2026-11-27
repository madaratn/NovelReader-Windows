// src/i18n.ts: French elision before a name ("la diffusion d’Ali", not "de Ali").
const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const esbuild = require('esbuild')
const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../../src/i18n.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent' }).outputFiles[0].text
const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require)
const { t, setLang } = m.exports

test('French: "de" before a name that starts with a vowel is "d’"', () => {
  setLang('fr')
  assert.equal(t('Stream of {name}', { name: 'Ali' }), 'Diffusion d’Ali')
  assert.equal(t('Stream of {name}', { name: 'Élodie' }), 'Diffusion d’Élodie')
  assert.equal(t('Stream of {name}', { name: 'inès' }), 'Diffusion d’inès')
  assert.equal(t('Stream of {name}', { name: 'Sara' }), 'Diffusion de Sara')
  assert.equal(t('Stream of {name}', { name: 'Yanis' }), 'Diffusion de Yanis')
  assert.equal(t('Stream of {name}', { name: 'Hugo' }), 'Diffusion de Hugo') // (an "h" is left alone: it is sometimes sounded)
  assert.equal(t('Room of {name}', { name: 'Ali' }), 'Salon d’Ali')
  assert.equal(t('You are watching the stream of {name}.', { name: 'Omar' }), 'Tu regardes la diffusion d’Omar.')
  // English is untouched, and so is a sentence without "de {name}"
  assert.equal(t('{name} paused', { name: 'Ali' }), 'Ali a mis en pause')
  setLang('en')
  assert.equal(t('Stream of {name}', { name: 'Ali' }), 'Stream of Ali')
})
