import { describe, expect, it } from 'vitest';
import { getCompletionCopyForStatus } from './RegistrationHub';

describe('registration completion states', () => {
  it('keeps a verification-ready operator in review until AFAT approval', () => {
    expect(getCompletionCopyForStatus('citizen_reg', 'verification_ready', 'UNDER_REVIEW')).toEqual({
      title: 'Operator Review Started',
      body: 'AFAT received the operator file and opened review. Dispatch, live bookings, and marketplace activation begin after approval from operations.',
    });
  });

  it('labels an already-approved operator as active without implying a new promotion', () => {
    expect(getCompletionCopyForStatus('citizen_reg', 'verification_ready', 'APPROVED')).toEqual({
      title: 'Operator Access Active',
      body: 'This account was already approved by AFAT. The operator terminal is available now; no new approval was created by this registration update.',
    });
  });

  it('keeps company intake separate from planner authority', () => {
    expect(getCompletionCopyForStatus('company', 'verification_ready')).toEqual({
      title: 'Fleet Review Opened',
      body: 'AFAT received the company file. Fleet operations remain organisation-scoped; AFAT Planner and Admin authority require separate staff invitations.',
    });
  });

  it('creates a public partner review without granting platform authority', () => {
    expect(getCompletionCopyForStatus('gov_link', 'under_review')).toEqual({
      title: 'Public Partner Review Opened',
      body: 'AFAT received the institution, mandate and representative details. The workspace is limited to aggregated public-mobility coordination while verification continues.',
    });
  });
});
