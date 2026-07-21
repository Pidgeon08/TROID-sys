import api from './api';

const ROLE_LABELS = {
  admin: 'Admin',
  mayorsoffice: 'Mayor',
  barangay: 'Barangay',
};

export function logAudit({ currentUser, user, role, action, module, details = '', status = 'success' }) {
  const resolvedUser = user || currentUser?.name || 'System';
  const resolvedRole = role || ROLE_LABELS[currentUser?.role] || currentUser?.role || '-';
  return api.createAuditLog({
    user: resolvedUser,
    role: resolvedRole,
    action,
    details,
    module,
    status,
  }).catch((err) => {
    console.error('Failed to record audit log:', err);
  });
}
