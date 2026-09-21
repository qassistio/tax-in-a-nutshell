// Computes HMRC's IRmark digital signature over a GovTalk submission body.
// Server-side because HMRC's algorithm needs real W3C Exclusive XML
// Canonicalization (omit-comments), which needs an actual XML DOM — uses
// `xml-crypto`'s ExclusiveCanonicalization (node-saml, actively
// maintained) over `@xmldom/xmldom`.
//
// Algorithm (HMRC's Generic IRmark Spec): canonicalise `<Body>` with
// `<IRmark>` present but empty (see buildIrMarkHashingBody), SHA-1 digest
// the canonical bytes, base64 encode.

import { DOMParser } from '@xmldom/xmldom'
import { ExclusiveCanonicalization } from 'xml-crypto'
import { createHash } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ bodyXml: string }>(event)
  if (!body?.bodyXml) {
    throw createError({ statusCode: 400, statusMessage: 'Missing bodyXml' })
  }

  const doc = new DOMParser({
    // xmldom logs parse warnings to the console by default; treat them as
    // real errors so a malformed body fails loudly, not silently.
    onError: (level: string, msg: string) => {
      throw createError({ statusCode: 400, statusMessage: `Malformed bodyXml (${level}): ${msg}` })
    }
  }).parseFromString(body.bodyXml, 'text/xml')

  if (!doc.documentElement) {
    throw createError({ statusCode: 400, statusMessage: 'bodyXml has no root element' })
  }
  // xml-crypto's .d.ts types process() against the browser DOM Element
  // interface, unavailable here — cast just bridges the two type defs,
  // works fine with @xmldom/xmldom at runtime.
  const canonical = new ExclusiveCanonicalization().process(doc.documentElement as unknown as Parameters<ExclusiveCanonicalization['process']>[0], {})
  const digest = createHash('sha1').update(canonical, 'utf8').digest()
  return { irMark: digest.toString('base64') }
})
