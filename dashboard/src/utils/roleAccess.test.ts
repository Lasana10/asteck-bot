import { describe, expect, it } from 'vitest';
import { canUseOperatorConsole, hasPendingOperatorApplication } from './roleAccess';

describe('operator access state', () => {
  it('opens the console for an approved, active operator', () => {
    expect(canUseOperatorConsole({
      role: 'operator',
      is_active: true,
      approval_status: 'approved',
      operator_application_status: 'APPROVED',
    })).toBe(true);
    expect(hasPendingOperatorApplication({ operator_application_status: 'APPROVED' })).toBe(false);
  });

  it('keeps pending applications out of the live console', () => {
    expect(canUseOperatorConsole({
      role: 'operator',
      is_active: true,
      approval_status: 'approved',
      operator_application_status: 'UNDER_REVIEW',
    })).toBe(false);
    expect(hasPendingOperatorApplication({ operator_application_status: 'UNDER_REVIEW' })).toBe(true);
  });

  it('keeps inactive or suspended operators out after approval', () => {
    const approved = {
      role: 'operator',
      approval_status: 'approved',
      operator_application_status: 'APPROVED',
    };
    expect(canUseOperatorConsole({ ...approved, is_active: false })).toBe(false);
    expect(canUseOperatorConsole({ ...approved, is_active: true, approval_status: 'suspended' })).toBe(false);
  });
});
