import { describe, expect, it } from 'vitest';
import { ROLE_FLOW } from '../../utils/roleWorkspace';

describe('adaptive role workspace', () => {
  it('gives each approved role one explicit service flow', () => {
    expect(ROLE_FLOW.commuter).toEqual(['Plan', 'Meet', 'Ride', 'Arrive']);
    expect(ROLE_FLOW.operator).toEqual(['Online', 'Accept', 'Pickup', 'Complete']);
    expect(ROLE_FLOW.planner).toEqual(['Detect', 'Decide', 'Dispatch', 'Measure']);
    expect(ROLE_FLOW.organization).toEqual(['Register', 'Assign', 'Monitor', 'Comply']);
    expect(ROLE_FLOW.government).toEqual(['Observe', 'Mandate', 'Respond', 'Measure']);
    expect(ROLE_FLOW.admin).toEqual(['Verify', 'Approve', 'Authorize', 'Audit']);
  });

  it('keeps every flow aligned to the four persistent workspace tabs', () => {
    Object.values(ROLE_FLOW).forEach((flow) => expect(flow).toHaveLength(4));
  });
});
