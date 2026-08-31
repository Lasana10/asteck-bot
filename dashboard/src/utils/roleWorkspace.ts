export type RoleWorkspace = 'commuter' | 'operator' | 'organization' | 'government' | 'planner' | 'admin';

export const ROLE_FLOW: Record<RoleWorkspace, string[]> = {
  commuter: ['Plan', 'Meet', 'Ride', 'Arrive'],
  operator: ['Online', 'Accept', 'Pickup', 'Complete'],
  planner: ['Detect', 'Decide', 'Dispatch', 'Measure'],
  organization: ['Register', 'Assign', 'Monitor', 'Comply'],
  government: ['Observe', 'Mandate', 'Respond', 'Measure'],
  admin: ['Verify', 'Approve', 'Authorize', 'Audit'],
};
