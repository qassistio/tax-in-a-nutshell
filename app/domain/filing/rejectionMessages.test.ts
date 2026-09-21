import { describe, expect, it } from 'vitest'
import { translateGovTalkError, translateGovTalkErrors } from './rejectionMessages'

describe('translateGovTalkError', () => {
  it('translates a known error code to a plain-English headline and step', () => {
    const translated = translateGovTalkError({ number: '1046', text: 'Authentication Failure' })
    expect(translated.code).toBe('1046')
    expect(translated.headline).toMatch(/gateway sign-in/i)
    expect(translated.step).toBe('declaration')
    expect(translated.rawText).toBe('Authentication Failure')
  })

  it('falls back to the raw HMRC text for an unrecognised code, without inventing detail', () => {
    const translated = translateGovTalkError({ number: '7777', text: 'Some unseen HMRC error text' })
    expect(translated.code).toBe('7777')
    expect(translated.headline).toBe('HMRC rejected this submission')
    expect(translated.detail).toBe('Some unseen HMRC error text')
    expect(translated.step).toBeUndefined()
  })

  it('falls back gracefully when there is no error number at all', () => {
    const translated = translateGovTalkError({ text: 'Unspecified failure' })
    expect(translated.code).toBeUndefined()
    expect(translated.detail).toBe('Unspecified failure')
  })

  it('provides a generic detail message when the raw text is also empty', () => {
    const translated = translateGovTalkError({ text: '' })
    expect(translated.detail).toMatch(/did not provide further detail/i)
  })
})

describe('translateGovTalkErrors', () => {
  it('maps each error independently', () => {
    const translated = translateGovTalkErrors([{ number: '1046', text: 'a' }, { number: '9999', text: 'b' }])
    expect(translated).toHaveLength(2)
    expect(translated[0]!.step).toBe('declaration')
    expect(translated[1]!.headline).toMatch(/could not process/i)
  })
})
