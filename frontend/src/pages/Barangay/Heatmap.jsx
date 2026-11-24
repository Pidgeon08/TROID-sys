import HeatmapView from '../Admin/HeatmapView';
import { canonicalBarangay } from '../../utils/barangayBoundaries';

// Bot Tracking: the same map CENRO uses (live heat map, bot pathing, area coverage, bot trail and
// post-cleanup comparison), limited to the barangay this account is assigned to.
export default function Heatmap({ currentUser }) {
  const location = (currentUser?.location || '').trim();
  return <HeatmapView barangay={canonicalBarangay(location) || location} />;
}
