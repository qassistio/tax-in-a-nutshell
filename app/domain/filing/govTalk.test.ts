import { describe, expect, it } from 'vitest'
import { buildGovTalkEnvelope, buildGovTalkPollEnvelope, buildIrMarkHashingBody, parseGovTalkResponse } from './govTalk'

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

describe('buildIrMarkHashingBody', () => {
  // The actual canonicalisation + SHA-1/base64 digest happens server-side
  // (server/api/hmrc/compute-irmark.post.ts, using a real C14N library) —
  // this only checks the XML fragment shape that gets sent there, since
  // that's the part requirements.md §37/§38 keeps in the Vue/Node-free
  // domain layer.
  const input = { companyUtr: '1234567890', companyName: 'Acme & Co', periodEnd: '2024-12-31', bodyXml: '<CompanyTaxReturn />' }

  it('wraps the real Body content with an explicit envelope namespace and an empty IRmark', () => {
    const xml = buildIrMarkHashingBody(input)
    expect(xml).toContain('<Body xmlns="http://www.govtalk.gov.uk/CM/envelope">')
    expect(xml).toContain('<IRmark Type="generic"></IRmark>')
    expect(xml).toContain('<Key Type="UTR">1234567890</Key>')
    expect(xml).toContain('<CompanyTaxReturn />')
    expect(xml).toContain('Acme &amp; Co')
  })

  it('matches the IRenvelope content buildGovTalkEnvelope embeds, aside from the empty IRmark', () => {
    const hashingBody = buildIrMarkHashingBody(input)
    const envelope = buildGovTalkEnvelope({
      messageClass: 'HMRC-CT-CT600-TIL', credentials, irMark: 'REALMARK==', ...input
    })
    expect(hashingBody).toContain('<PeriodEnd>2024-12-31</PeriodEnd>')
    expect(envelope).toContain('<PeriodEnd>2024-12-31</PeriodEnd>')
    expect(envelope).toContain('<IRmark Type="generic">REALMARK==</IRmark>')
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
