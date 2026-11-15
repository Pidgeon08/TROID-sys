// Map layer names, colours and labels shared by the Heatmap page and the dashboards.
// Bot Pathing is drawn as nodes along the robot's path; the other layers are heat.
export const MAP_LAYERS = ['Waste Density', 'Bot Pathing', 'Trash Collected'];
export const PATHING = 'Bot Pathing';
export const HEAT_GRADIENTS = {
  'Waste Density': { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' },
  'Trash Collected': { 0.0: '#cbd5e1', 0.5: '#64748b', 1.0: '#0f172a' },
};
export const LEGEND_CLASSES = {
  'Waste Density': 'bg-gradient-to-r from-blue-500 via-cyan-400 via-emerald-400 via-yellow-400 to-red-500',
  'Trash Collected': 'bg-gradient-to-r from-slate-300 via-slate-500 to-slate-900',
};
// One colour per robot on the Bot Pathing layer.
export const PATH_COLORS = ['#1b4de4', '#7c3aed', '#db2777', '#0891b2', '#ea580c', '#4d7c0f'];
export const PATH_START = '#10b981';

export function formatClock(ms) {
  if (ms === null || ms === undefined) return '—';
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
