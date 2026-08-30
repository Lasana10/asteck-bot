export type WorkspaceRole = 'commuter' | 'operator' | 'organization' | 'government' | 'planner' | 'admin';
export type WorkspaceTab = 'home' | 'book' | 'bookings' | 'notifications' | 'profile';

export function resolveWorkspaceRole(
  platformRole: string,
  selectedWorkspace: 'passenger' | 'organization' | 'government',
  hasOrganizationMembership: boolean,
  hasPublicPartnerMembership: boolean,
): WorkspaceRole {
  if (platformRole !== 'commuter') return platformRole as WorkspaceRole;
  if (selectedWorkspace === 'organization' && hasOrganizationMembership) return 'organization';
  if (selectedWorkspace === 'government' && hasPublicPartnerMembership) return 'government';
  return 'commuter';
}

export function restoreWorkspaceTab(savedTab: string | null): WorkspaceTab {
  return savedTab === 'bookings' || savedTab === 'notifications' || savedTab === 'profile' ? savedTab : 'home';
}

export function workspaceTabStorageKey(role: WorkspaceRole): string {
  return `afat_workspace_tab_${role}`;
}
