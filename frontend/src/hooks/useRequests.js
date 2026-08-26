import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { mapRequest, matchesRequestQuery } from '../constants/requests';

export function useRequests(userRole = 'admin') {
  const [requests, setRequests] = useState([]);
  const [scheduledRequestIds, setScheduledRequestIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All Requests');
  const [searchQuery, setSearchQuery] = useState('');

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
  }, []);

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => matchesRequestQuery(req, searchQuery));
  }, [requests, searchQuery]);

  const filteredByTab = useMemo(() => {
    if (activeTab === 'All Requests') return filteredRequests;
    const statusMap = {
      'Pending Mayor': 'Pending Mayor Approval',
      'Pending Admin': 'Pending Admin Approval',
      'Approved': 'Approved',
      'Declined': 'Declined',
      'Parked': 'Parked',
      'Pending': 'Pending Mayor Approval',
      'Deployed': 'Approved',
      'Completed': 'Completed',
      'Segregated': 'Segregated',
    };
    const targetStatus = statusMap[activeTab] || activeTab;
    if (activeTab === 'Unscheduled') {
      return filteredRequests.filter((r) => r.status === 'Approved' && !scheduledRequestIds.has(r.id));
    }
    return filteredRequests.filter((r) => r.status === targetStatus);
  }, [filteredRequests, activeTab, scheduledRequestIds]);

  const counts = useMemo(() => {
    if (userRole === 'mayorsoffice') {
      return {
        total: requests.length,
        pending: requests.filter((r) => r.status === 'Pending Mayor Approval').length,
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
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    filteredRequests,
    filteredByTab,
    counts,
    scheduledRequestIds,
  };
}
