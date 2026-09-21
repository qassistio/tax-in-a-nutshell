import { describe, expect, it } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { ExclusiveCanonicalization } from 'xml-crypto'
import { createHash } from 'node:crypto'

// Exercises the same canonicalise-then-digest pipeline as
// compute-irmark.post.ts directly (rather than spinning up a Nitro event),
// to pin down the *real* W3C Exclusive C14N semantics this route relies
// on — in particular that it does NOT collapse whitespace the way the
// old hand-rolled approximateCanonicalize() used to, which was the
// confirmed bug this route replaced.
function irMarkOf(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const canonical = new ExclusiveCanonicalization().process(doc.documentElement, {})
  return createHash('sha1').update(canonical, 'utf8').digest('base64')
}

describe('IRmark canonicalisation + digest (real C14N, via xml-crypto)', () => {
  it('is deterministic for the same body', () => {
    expect(irMarkOf('<Body><A>1</A></Body>')).toBe(irMarkOf('<Body><A>1</A></Body>'))
  })

  it('is SENSITIVE to whitespace between elements, unlike the old approximation', () => {
    const a = irMarkOf('<Body><A>1</A></Body>')
    const b = irMarkOf('<Body>\n  <A>1</A>\n</Body>')
    expect(a).not.toBe(b)
  })

  it('is insensitive to attribute order (real C14N sorts attributes)', () => {
    const a = irMarkOf('<A x="1" y="2" />')
    const b = irMarkOf('<A y="2" x="1" />')
    expect(a).toBe(b)
  })

  it('changes when the content changes', () => {
    const a = irMarkOf('<Body><A>1</A></Body>')
    const b = irMarkOf('<Body><A>2</A></Body>')
    expect(a).not.toBe(b)
  })

  it('produces a plausible base64-encoded SHA-1 digest (20 bytes)', () => {
    const mark = irMarkOf('<Body><A>1</A></Body>')
    expect(Buffer.from(mark, 'base64').length).toBe(20)
  })
})
