import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';

export function useOperators() {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const selected = useMemo(() => operators.find((o) => o.id === selectedId) || null, [operators, selectedId]);

  useEffect(() => {
    let cancelled = false;
    async function fetchOperators() {
      try {
        const res = await api.operators();
        const mapped = Array.isArray(res) ? res.map((o) => ({
          backendId: o.id,
          id: o.operator_id,
          name: o.name,
          status: o.status === 'available' ? 'Available' : 'Unavailable',
          availability: o.availability === 'assigned' ? 'Assigned' : o.availability === 'unavailable' ? 'Unavailable' : 'Available',
          assignedBot: o.assigned_bot,
          archived: o.archived,
          email: o.email || null,
          accountStatus: o.account_status || null,
          userId: o.user || null,
        })) : [];
        if (!cancelled) {
          setOperators(mapped);
          if (mapped.length > 0 && selectedId === null) {
            setSelectedId(mapped[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch operators:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchOperators();
    return () => { cancelled = true; };
  }, [selectedId]);

  const updateOperator = useMemo(() => (id, updates) => {
    setOperators((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  }, []);

  const addOperator = useMemo(() => (operator) => {
    setOperators((prev) => [operator, ...prev]);
  }, []);

  return { operators, loading, selected, selectedId, setSelectedId, updateOperator, addOperator };
}
