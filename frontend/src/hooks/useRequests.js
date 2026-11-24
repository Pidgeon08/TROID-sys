import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { mapRequest } from '../constants/requests';
import { useLiveVersion } from './useLiveUpdates';

export function useRequests(userRole = 'admin') {
  const [requests, setRequests] = useState([]);
  const [scheduledRequestIds, setScheduledRequestIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  // Loaded again whenever a request or a booking changes anywhere.
  const live = useLiveVersion('requests', 'schedules');

  useEffect(() => {
    let cancelled = false;
    async function fetchRequests() {
      try {
        const [res, schedulesData] = await Promise.all([api.requests(), api.deploymentSchedules()]);
        const mapped = Array.isArray(res) ? res.map(mapRequest) : [];
        if (!cancelled) {
          setRequests(mapped);
          const scheduledIds = new Set();
          if (Array.isArray(schedulesData)) {
            schedulesData.forEach((s) => {
              if (s.request_id) scheduledIds.add(s.request_id);
            });
          }
          setScheduledRequestIds(scheduledIds);
        }
      } catch (err) {
        console.error('Failed to fetch requests:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRequests();
    return () => { cancelled = true; };
  }, [live]);

  const counts = useMemo(() => {
    if (userRole === 'mayorsoffice') {
      return {
        total: requests.length,
        pending: requests.filter((r) => r.status === 'Pending City Admin Approval').length,
        approved: requests.filter((r) => r.status === 'Approved' || r.status === 'Pending Admin Approval').length,
        declined: requests.filter((r) => r.status === 'Declined').length,
        parked: requests.filter((r) => r.status === 'Parked').length,
      };
    }
    return {
      total: requests.length,
      pending: requests.filter((r) => r.status === 'Pending Admin Approval').length,
      approved: requests.filter((r) => r.status === 'Approved').length,
      declined: requests.filter((r) => r.status === 'Declined').length,
      parked: requests.filter((r) => r.status === 'Parked').length,
    };
  }, [requests, userRole]);

  return {
    requests,
    setRequests,
    loading,
    counts,
    scheduledRequestIds,
  };
}
