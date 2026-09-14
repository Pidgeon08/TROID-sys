import { CheckCircle2, Circle } from 'lucide-react';
import { passwordRuleResults } from '../utils/passwordRules';

export default function PasswordRulesChecklist({ value }) {
  const results = passwordRuleResults(value);
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-1.5">
      {results.map((rule) => (
        <div key={rule.key} className="flex items-center gap-2 text-xs font-medium">
          {rule.met ? (
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          ) : (
            <Circle size={14} className="text-slate-300 shrink-0" />
          )}
          <span className={rule.met ? 'text-emerald-700' : 'text-slate-500'}>{rule.label}</span>
        </div>
      ))}
    </div>
  );
}
