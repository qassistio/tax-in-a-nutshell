import { describe, expect, it } from 'vitest'
import { buildGovTalkEnvelope, buildGovTalkPollEnvelope, computeIRmark, parseGovTalkResponse } from './govTalk'

const credentials = { gatewayUserId: 'user1', gatewayPassword: 'pass1', vendorId: 'vendor1' }

describe('buildGovTalkEnvelope', () => {
  it('embeds the message class, UTR, IRmark and body XML', () => {
    const xml = buildGovTalkEnvelope({
      messageClass: 'HMRC-CT-CT600-TIL',
      credentials,
      companyUtr: '1234567890',
      companyName: 'Acme & Co',
      periodEnd: '2024-12-31',
      bodyXml: '<CompanyTaxReturn />',
      irMark: 'abc123=='
    })
    expect(xml).toContain('<Class>HMRC-CT-CT600-TIL</Class>')
    expect(xml).toContain('<Qualifier>request</Qualifier>')
    expect(xml).toContain('<Key Type="UTR">1234567890</Key>')
    expect(xml).toContain('<IRmark Type="generic">abc123==</IRmark>')
    expect(xml).toContain('<CompanyTaxReturn />')
    // Ampersand in the company name must be escaped, not passed through raw.
    expect(xml).toContain('Acme &amp; Co')
  })
})

describe('buildGovTalkPollEnvelope', () => {
  it('uses Qualifier poll and carries the CorrelationID', () => {
    const xml = buildGovTalkPollEnvelope({
      messageClass: 'HMRC-CT-CT600-TIL',
      credentials,
      correlationId: 'corr-123'
    })
    expect(xml).toContain('<Qualifier>poll</Qualifier>')
    expect(xml).toContain('<CorrelationID>corr-123</CorrelationID>')
  })
})

describe('computeIRmark', () => {
  it('is deterministic for the same body', async () => {
    const a = await computeIRmark('<Body><A>1</A></Body>')
    const b = await computeIRmark('<Body><A>1</A></Body>')
    expect(a).toBe(b)
  })

  it('is insensitive to insignificant whitespace between elements', async () => {
    const a = await computeIRmark('<Body><A>1</A></Body>')
    const b = await computeIRmark('<Body>\n  <A>1</A>\n</Body>')
    expect(a).toBe(b)
  })

  it('is insensitive to attribute order', async () => {
    const a = await computeIRmark('<A x="1" y="2" />')
    const b = await computeIRmark('<A y="2" x="1" />')
    expect(a).toBe(b)
  })

  it('changes when the content changes', async () => {
    const a = await computeIRmark('<Body><A>1</A></Body>')
    const b = await computeIRmark('<Body><A>2</A></Body>')
    expect(a).not.toBe(b)
  })
})

describe('parseGovTalkResponse', () => {
  it('parses an acknowledgement with poll endpoint and interval', () => {
    const xml = `<GovTalkMessage><Header><MessageDetails><Qualifier>acknowledgement</Qualifier>
      <CorrelationID>corr-1</CorrelationID>
      <ResponseEndPoint PollInterval="5"><EndPoint>https://example.test/poll</EndPoint><PollInterval>5</PollInterval></ResponseEndPoint>
      </MessageDetails></Header></GovTalkMessage>`
    const result = parseGovTalkResponse(xml)
    expect(result.qualifier).toBe('acknowledgement')
    if (result.qualifier === 'acknowledgement') {
      expect(result.correlationId).toBe('corr-1')
      expect(result.pollEndpoint).toBe('https://example.test/poll')
      expect(result.pollIntervalSeconds).toBe(5)
    }
  })

  it('parses an error response into structured Error details', () => {
    const xml = `<GovTalkMessage><Header><MessageDetails><Qualifier>error</Qualifier>
      <CorrelationID>corr-2</CorrelationID></MessageDetails></Header>
      <GovTalkDetails><GovTalkErrors>
        <Error><Number>1046</Number><Text>Authentication Failure</Text><Location>Header</Location></Error>
      </GovTalkErrors></GovTalkDetails></GovTalkMessage>`
    const result = parseGovTalkResponse(xml)
    expect(result.qualifier).toBe('error')
    if (result.qualifier === 'error') {
      expect(result.correlationId).toBe('corr-2')
      expect(result.errors).toEqual([{ number: '1046', text: 'Authentication Failure', location: 'Header' }])
    }
  })

  it('falls back to a generic error when no <Error> block is present', () => {
    const xml = `<GovTalkMessage><Header><MessageDetails><Qualifier>error</Qualifier></MessageDetails></Header></GovTalkMessage>`
    const result = parseGovTalkResponse(xml)
    expect(result.qualifier).toBe('error')
    if (result.qualifier === 'error') {
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]!.number).toBeUndefined()
    }
  })

  it('parses a response with a Body payload', () => {
    const xml = `<GovTalkMessage><Header><MessageDetails><Qualifier>response</Qualifier>
      <CorrelationID>corr-3</CorrelationID></MessageDetails></Header>
      <Body><SuccessResponse><Accepted /></SuccessResponse></Body></GovTalkMessage>`
    const result = parseGovTalkResponse(xml)
    expect(result.qualifier).toBe('response')
    if (result.qualifier === 'response') {
      expect(result.correlationId).toBe('corr-3')
      expect(result.bodyXml).toContain('<SuccessResponse>')
    }
  })

  it('falls back to unknown for anything else, keeping the raw XML rather than guessing', () => {
    const xml = '<SomethingElse />'
    const result = parseGovTalkResponse(xml)
    expect(result.qualifier).toBe('unknown')
    if (result.qualifier === 'unknown') {
      expect(result.raw).toBe(xml)
    }
  })
})
