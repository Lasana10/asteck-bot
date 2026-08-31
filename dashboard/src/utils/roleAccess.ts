export function canUseOperatorConsole(profile: any): boolean {
  if (!profile) return false;

  const role = String(profile.role || '').toLowerCase();
  const applicationStatus = String(profile.operator_application_status || '').toUpperCase();
  const approvalStatus = String(profile.approval_status || '').toLowerCase();

  return role === 'operator'
    && profile.is_active !== false
    && approvalStatus !== 'suspended'
    && applicationStatus === 'APPROVED';
}

export function hasPendingOperatorApplication(profile: any): boolean {
  const status = String(profile?.operator_application_status || '').toUpperCase();
  return Boolean(status && !['NOT_APPLIED', 'APPROVED'].includes(status));
}
