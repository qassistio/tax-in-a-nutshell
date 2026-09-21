// Computes HMRC's IRmark digital signature over a GovTalk submission body.
// Deliberately server-side: HMRC's published algorithm requires real W3C
// Exclusive XML Canonicalization (omit-comments variant), which needs an
// actual XML DOM and a conformant C14N implementation — not something
// worth hand-rolling (see the CAVEAT this route replaces in
// app/domain/filing/govTalk.ts's git history). Uses `xml-crypto`'s
// ExclusiveCanonicalization (part of the node-saml org's XML-DSig
// library — actively maintained, used across the SAML ecosystem, unlike
// the abandoned `xml-c14n` package) over `@xmldom/xmldom`.
//
// Algorithm, per HMRC's Generic IRmark Specification: canonicalise the
// `<Body>` element (with the `<IRmark>` element present but empty — see
// buildIrMarkHashingBody), SHA-1 digest the canonical bytes, base64
// encode the digest.

import { DOMParser } from '@xmldom/xmldom'
import { ExclusiveCanonicalization } from 'xml-crypto'
import { createHash } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ bodyXml: string }>(event)
  if (!body?.bodyXml) {
    throw createError({ statusCode: 400, statusMessage: 'Missing bodyXml' })
  }

  const doc = new DOMParser({
    // xmldom logs parse warnings/errors to the console by default; treat
    // them as real errors instead so a malformed body fails loudly here
    // rather than silently producing a wrong IRmark.
    onError: (level: string, msg: string) => {
      throw createError({ statusCode: 400, statusMessage: `Malformed bodyXml (${level}): ${msg}` })
    }
  }).parseFromString(body.bodyXml, 'text/xml')

  if (!doc.documentElement) {
    throw createError({ statusCode: 400, statusMessage: 'bodyXml has no root element' })
  }
  // xml-crypto's .d.ts types `process()` against the ambient (browser) DOM
  // `Element` interface, which isn't available in this server (non-"dom"
  // lib) context, and wouldn't structurally match @xmldom/xmldom's own
  // Element class anyway — the library works with either at runtime, this
  // cast just bridges the two type definitions.
  const canonical = new ExclusiveCanonicalization().process(doc.documentElement as unknown as Parameters<ExclusiveCanonicalization['process']>[0], {})
  const digest = createHash('sha1').update(canonical, 'utf8').digest()
  return { irMark: digest.toString('base64') }
})
