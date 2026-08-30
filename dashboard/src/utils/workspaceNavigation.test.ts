import { describe, expect, it } from 'vitest';
import { resolveWorkspaceRole, restoreWorkspaceTab, workspaceTabStorageKey } from './workspaceNavigation';

describe('workspace navigation', () => {
  it('keeps entity workspaces separate from the global commuter role', () => {
    expect(resolveWorkspaceRole('commuter', 'organization', true, false)).toBe('organization');
    expect(resolveWorkspaceRole('commuter', 'government', false, true)).toBe('government');
  });

  it('does not open a workspace without an active membership', () => {
    expect(resolveWorkspaceRole('commuter', 'organization', false, false)).toBe('commuter');
    expect(resolveWorkspaceRole('commuter', 'government', false, false)).toBe('commuter');
  });

  it('never converts a controlled platform role into an entity workspace', () => {
    expect(resolveWorkspaceRole('planner', 'organization', true, true)).toBe('planner');
    expect(resolveWorkspaceRole('operator', 'government', true, true)).toBe('operator');
  });

  it('restores only tabs that exist in every role workspace', () => {
    expect(restoreWorkspaceTab('notifications')).toBe('notifications');
    expect(restoreWorkspaceTab('book')).toBe('home');
    expect(restoreWorkspaceTab('unknown')).toBe('home');
    expect(workspaceTabStorageKey('government')).toBe('afat_workspace_tab_government');
  });
});
