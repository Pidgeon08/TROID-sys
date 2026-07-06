import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { mapRequest } from '../constants/requests';

export function useRequests(userRole = 'admin') {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All Requests');
  const [searchQuery, setSearchQuery] = useState('');

  const isBarangay = userRole === 'barangay';

  useEffect(() => {
    let cancelled = false;
    async function fetchRequests() {
      try {
        const res = await api.requests();
        const mapped = Array.isArray(res) ? res.map(mapRequest) : [];
        if (!cancelled) setRequests(mapped);
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
    return requests.filter((req) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          req.id.toLowerCase().includes(q) ||
          req.type.toLowerCase().includes(q) ||
          (req.requestedBy?.name || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [requests, searchQuery]);

  const filteredByTab = useMemo(() => {
    if (activeTab === 'All Requests') return filteredRequests;
    const statusMap = {
      'Pending Mayor': 'Pending Mayor Approval',
      'Pending Admin': 'Pending Admin Approval',
      'Approved': 'Approved',
      'Declined': 'Declined',
      'Pending': 'Pending Mayor Approval',
      'Deployed': 'Approved',
      'Completed': 'Completed',
      'Segregated': 'Segregated',
    };
    const targetStatus = statusMap[activeTab] || activeTab;
    return filteredRequests.filter((r) => r.status === targetStatus);
  }, [filteredRequests, activeTab]);

  const counts = useMemo(() => {
    if (userRole === 'mayorsoffice') {
      return {
        total: requests.length,
        pending: requests.filter((r) => r.status === 'Pending Mayor Approval').length,
        approved: requests.filter((r) => r.status === 'Approved' || r.status === 'Pending Admin Approval').length,
        declined: requests.filter((r) => r.status === 'Declined').length,
      };
    }
    return {
      total: requests.length,
      pending: requests.filter((r) => r.status === 'Pending Admin Approval').length,
      approved: requests.filter((r) => r.status === 'Approved').length,
      declined: requests.filter((r) => r.status === 'Declined').length,
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
  };
}
