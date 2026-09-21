import { describe, expect, it } from 'vitest'
import { parseCompaniesHouseResponse, parseCompaniesHouseStatusPollResponse } from './companiesHouseGovTalk'

describe('parseCompaniesHouseResponse', () => {
  // Real shape from CH's own examples (invalid_authcode.xml / invalid_company_number.xml,
  // xmlforum.companieshouse.gov.uk) — errors sit in <GovTalkDetails><GovTalkErrors>, not <Body>.
  it('parses an error response with GovTalkErrors', () => {
    const xml = `<GovTalkMessage><Header><MessageDetails><Qualifier>error</Qualifier></MessageDetails></Header>
      <GovTalkDetails><Keys/><GovTalkErrors>
        <Error><RaisedBy>CompanyDataRequest</RaisedBy><Number>9999</Number><Type>fatal</Type>
        <Text>Invalid CompanyAuthenticationCode</Text><Location></Location></Error>
      </GovTalkErrors></GovTalkDetails><Body></Body></GovTalkMessage>`
    const result = parseCompaniesHouseResponse(xml)
    expect(result.qualifier).toBe('error')
    if (result.qualifier === 'error') {
      expect(result.errors).toEqual([{ number: '9999', text: 'Invalid CompanyAuthenticationCode', location: '' }])
    }
  })
})

describe('parseCompaniesHouseStatusPollResponse', () => {
  // Real shape from Companies House's own published example at
  // xmlgw.companieshouse.gov.uk/examples/GetSubmissionStatus_response.xml —
  // <StatusCode>, not <Status>/<status>; reject detail in <Rejections><Reject><Description>,
  // not a flat <Reject_message> (that's HMRC's element name, not CH's).
  it('reads StatusCode ACCEPT with no rejections', () => {
    const xml = `<Status>
      <SubmissionNumber>dp2872</SubmissionNumber>
      <StatusCode>ACCEPT</StatusCode>
      <CompanyNumber>05120000</CompanyNumber>
      <Rejections></Rejections>
    </Status>`
    const result = parseCompaniesHouseStatusPollResponse(xml)
    expect(result.submissionNumber).toBe('dp2872')
    expect(result.status).toBe('ACCEPT')
    expect(result.rejectMessage).toBeUndefined()
  })

  it('reads StatusCode REJECT and joins Reject descriptions', () => {
    const xml = `<Status>
      <SubmissionNumber>dp2872</SubmissionNumber>
      <StatusCode>REJECT</StatusCode>
      <CompanyNumber>05120000</CompanyNumber>
      <Rejections>
        <Reject><RejectCode>1</RejectCode><Description>Random Test mode rejection</Description><InstanceNumber>1</InstanceNumber></Reject>
      </Rejections>
    </Status>`
    const result = parseCompaniesHouseStatusPollResponse(xml)
    expect(result.status).toBe('REJECT')
    expect(result.rejectMessage).toBe('Random Test mode rejection')
  })
})
