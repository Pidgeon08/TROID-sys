// The pieces both dashboards are built from (CENRO's, and the barangay/NGO one), so they look
// and behave the same: the month stat cards, the side panels, and their lists.
import { Link, useNavigate } from 'react-router-dom';
import { AreaPreviewButton } from './AreaPreviewModal';
import { ChevronRight, MapPin } from 'lucide-react';
import MonthSparkline from './MonthSparkline';
import { REQUEST_STATUS_STYLES, requestArea, toStatusLabel } from '../constants/requests';

export const DASHBOARD_CARD = 'bg-white rounded-2xl border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)]';
const PANEL_BUTTON = 'text-xs font-semibold text-slate-500 hover:text-[#1b4de4] border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer';

export function StatCard({ icon: Icon, title, value, unit, days, color, sparkUnit }) {
  return (
    <div className={`${DASHBOARD_CARD} flex flex-col justify-between overflow-hidden relative group hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)] transition-all duration-200`}>
      <div className="p-6 pb-0 flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900 truncate">{title}</h3>
          <div className="flex items-baseline gap-2.5 mt-2">
            <span className="text-3xl font-bold text-slate-950 tracking-tight">{value}</span>
            <span className="text-sm font-semibold text-slate-500">{unit}</span>
          </div>
        </div>
      </div>
      <MonthSparkline days={days} color={color} unit={sparkUnit} />
    </div>
  );
}

/** A side panel: a title (with an optional icon), an optional button, and its content. */
export function Panel({ title, icon: Icon, iconClassName = 'text-amber-500', action, children }) {
  return (
    <div className={`${DASHBOARD_CARD} p-5 shrink-0`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-1.5">
          {Icon && <Icon className={`w-4 h-4 ${iconClassName}`} />}
          {title}
        </h2>
        {action && (
          <button type="button" onClick={action.onClick} className={PANEL_BUTTON}>
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** The collection areas with the most bags (topCollectionAreas), as bars. */
export function TopAreasList({ areas, showBarangay = true }) {
  if (areas.length === 0) return <p className="text-xs text-slate-400 py-2">No collection data yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      {areas.map((item) => (
        <div key={item.key} className="flex items-center gap-3.5">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-900 shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`flex justify-between gap-2 text-xs font-bold text-slate-900 ${showBarangay ? '' : 'mb-1.5'}`}>
              <span className="truncate">{item.name}</span>
              <span className="shrink-0">{item.bags} Bags</span>
            </div>
            {showBarangay && <p className="truncate text-[11px] text-slate-500 mt-0.5 mb-1.5">{item.barangay}</p>}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#1b4de4] rounded-full transition-all duration-500" style={{ width: `${(item.bags / item.max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const shortTime = (iso) => (iso
  ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '');

const LINK = 'font-semibold text-slate-900 hover:text-[#1b4de4] hover:underline underline-offset-2';

/**
 * The latest requests, each one a link to what it is about: the row and its request ID open
 * the request; its collection area, when it has one, shows where it is on a map, with a link to
 * its Collection Areas page (`areaPath`).
 */
export function RecentActivityList({ requests, requestPath, areaPath }) {
  const navigate = useNavigate();
  if (requests.length === 0) return <p className="text-xs text-slate-400 py-2">No recent activity yet.</p>;
  return (
    <div className="flex flex-col gap-1">
      {requests.map((req) => {
        const area = req.collection_area_detail;
        const place = requestArea(req);
        return (
          <div
            key={req.request_id}
            onClick={() => navigate(requestPath(req))}
            className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
          >
            <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-50">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-400/80 group-hover:bg-[#1b4de4]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 leading-normal break-words">
                Request{' '}
                <Link to={requestPath(req)} onClick={(e) => e.stopPropagation()} className={LINK}>{req.request_id}</Link>
                {' '}submitted for{' '}
                {area ? (
                  <AreaPreviewButton area={{ areaId: area.area_id, name: area.name }} openPath={areaPath?.(area)} className={LINK}>
                    {place}
                  </AreaPreviewButton>
                ) : place}
              </p>
              <span className="text-[10px] font-semibold text-slate-400 mt-1 block">{shortTime(req.date_submitted)}</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 mt-1 shrink-0 text-slate-300 group-hover:text-[#1b4de4]" />
          </div>
        );
      })}
    </div>
  );
}

// How the website names a bot, e.g. "TRD-004" (Boat.label in the backend).
const botLabel = (id) => (id ? `TRD-${String(id).padStart(3, '0')}` : null);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

/** The latest requests with their status and robot, each opening its request page. */
export function RecentRequestsList({ requests, requestPath, emptyText }) {
  const navigate = useNavigate();
  if (requests.length === 0) return <p className="text-xs text-slate-400 py-2">{emptyText}</p>;
  return (
    <div className="flex flex-col divide-y divide-slate-100">
      {requests.map((req) => {
        const status = toStatusLabel(req.status);
        const manual = req.cleanup_type === 'unsupported';
        return (
          <button
            key={req.request_id}
            type="button"
            onClick={() => navigate(requestPath(req))}
            className="-mx-2 flex flex-col gap-1 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-slate-800">{req.request_id}</span>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${REQUEST_STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
                {status}
              </span>
            </div>
            <span className="truncate text-xs text-slate-600">
              {manual ? req.location_name || '—' : requestArea(req) || '—'}
            </span>
            <span className="flex justify-between gap-2 text-[11px] text-slate-400">
              <span>Submitted {day(req.date_submitted)}</span>
              <span>{manual ? 'No bot (manual)' : botLabel(req.bot_id) || 'Bot not assigned'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
