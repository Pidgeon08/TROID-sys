import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import api from '../services/api';
import PasswordRulesChecklist from './PasswordRulesChecklist';
import { passwordRuleResults } from '../utils/passwordRules';

export default function ForceChangePasswordModal({ user, currentPassword, onSuccess, onCancel }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const allMet = passwordRuleResults(password).every((r) => r.met);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = allMet && passwordsMatch && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await api.changeUserPassword(user.id, { old_password: currentPassword, password });
      onSuccess();
    } catch (err) {
      console.error('Failed to change password:', err);
      setError(err.message || 'Failed to change password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 border border-slate-100 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-900">Set a new password</h3>
        <p className="text-sm text-slate-500 mt-1 mb-5">
          You're signing in with a temporary password. Please set a new password to continue, {user?.name || ''}.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">New password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-10 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">Confirm new password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 ${
                confirmPassword.length > 0 && !passwordsMatch
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-500/20'
                  : 'border-slate-200 focus:border-blue-400 focus:ring-blue-500/30'
              }`}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-xs text-red-600">Passwords do not match.</p>
            )}
          </div>

          <PasswordRulesChecklist value={password} />

          <div className="flex gap-2 pt-1">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-[#1b4de4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#153eb8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving...' : 'Set new password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
