// Run with:  npm run test:color
// (node's built-in runner + native TypeScript stripping - no test dependency)

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AA_CONTRAST,
  contrastRatio,
  deriveRamp,
  hexToHsl,
  hslToHex,
  isHexColor,
  normalizeHexInput,
} from '../color.ts'

test('isHexColor accepts only the stored 6-digit form', () => {
  for (const v of ['#2E7D9A', '#000000', '#ffffff']) {
    assert.equal(isHexColor(v), true, v)
  }
  for (const v of ['', '#FFF', '2E7D9A', '#GGGGGG', '#2E7D9A ', 'red']) {
    assert.equal(isHexColor(v), false, v)
  }
})

test('normalizeHexInput canonicalizes what a human types', () => {
  assert.equal(normalizeHexInput('2e7d9a'), '#2E7D9A')
  assert.equal(normalizeHexInput('#2e7d9a'), '#2E7D9A')
  assert.equal(normalizeHexInput('  #2E7D9A  '), '#2E7D9A')
  assert.equal(normalizeHexInput('abc'), '#AABBCC')
  assert.equal(normalizeHexInput('#abc'), '#AABBCC')
  assert.equal(normalizeHexInput(''), null)
  assert.equal(normalizeHexInput('nope'), null)
  assert.equal(normalizeHexInput('#12345'), null)
})

test('hexToHsl and hslToHex round-trip', () => {
  for (const hex of ['#2E7D9A', '#C4663C', '#7C3A6E', '#FFD400', '#000000', '#FFFFFF', '#808080']) {
    const { h, s, l } = hexToHsl(hex)
    const back = hslToHex(h, s, l)
    // Allow one step of rounding per channel.
    const a = parseInt(hex.slice(1), 16)
    const b = parseInt(back.slice(1), 16)
    for (let shift = 0; shift <= 16; shift += 8) {
      const diff = Math.abs(((a >> shift) & 255) - ((b >> shift) & 255))
      assert.ok(diff <= 1, `${hex} -> ${back} channel drift ${diff}`)
    }
  }
})

test('contrastRatio matches known WCAG values', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21)
  assert.equal(Math.round(contrastRatio('#FFFFFF', '#FFFFFF')), 1)
  // Well-known: #767676 is the lightest grey that passes AA on white.
  assert.ok(contrastRatio('#767676', '#FFFFFF') >= AA_CONTRAST)
  assert.ok(contrastRatio('#777777', '#FFFFFF') < 4.55)
})

// The load-bearing test. Both contrast pairs must hold for every hue, or a
// custom color makes the calendar unreadable in one of the two renderers.
test('deriveRamp clears AA on both contrast pairs across the hue circle', () => {
  const samples: string[] = []
  for (let h = 0; h < 360; h += 15) {
    for (const [s, l] of [
      [100, 50], // fully saturated
      [60, 45],
      [30, 60],
      [12, 50], // near-grey
      [95, 75], // pale and bright - the hardest case
    ] as const) {
      samples.push(hslToHex(h, s, l))
    }
  }
  // Hues where naive lightness math fails: yellow and cyan are far brighter at
  // a given L than blue or red, so a fixed darkening step is not enough.
  samples.push('#FFD400', '#FFFF00', '#00FFFF', '#00FF00', '#E8E8E8', '#FFFFFF', '#000000')

  for (const hex of samples) {
    const ramp = deriveRamp(hex)

    const vsWhite = contrastRatio(ramp.text, '#FFFFFF')
    assert.ok(
      vsWhite >= AA_CONTRAST,
      `${hex}: banner fill ${ramp.text} vs white text = ${vsWhite.toFixed(2)}, need ${AA_CONTRAST}`,
    )

    const vsHighlight = contrastRatio(ramp.text, ramp.highlight)
    assert.ok(
      vsHighlight >= AA_CONTRAST,
      `${hex}: chip text ${ramp.text} on ${ramp.highlight} = ${vsHighlight.toFixed(2)}, need ${AA_CONTRAST}`,
    )
  }
})

test('deriveRamp keeps the admin choice as the swatch identity', () => {
  // dot is never adjusted - the picker swatch has to match what was picked.
  assert.equal(deriveRamp('#2E7D9A').dot, '#2E7D9A')
  assert.equal(deriveRamp('#2e7d9a').dot, '#2E7D9A')
})

test('deriveRamp returns valid hex for every channel', () => {
  const ramp = deriveRamp('#2E7D9A')
  for (const [key, value] of Object.entries(ramp)) {
    assert.ok(isHexColor(value), `${key} = ${value} is not a 6-digit hex`)
  }
})

test('deriveRamp keeps highlight lighter than text', () => {
  // The chip paints text on highlight; if the derivation ever inverted them the
  // contrast assertion could still pass while the design read as a dark blob.
  for (const hex of ['#2E7D9A', '#FFD400', '#7C3A6E', '#E8E8E8', '#000000']) {
    const ramp = deriveRamp(hex)
    assert.ok(
      hexToHsl(ramp.highlight).l > hexToHsl(ramp.text).l,
      `${hex}: highlight ${ramp.highlight} should be lighter than text ${ramp.text}`,
    )
  }
})
