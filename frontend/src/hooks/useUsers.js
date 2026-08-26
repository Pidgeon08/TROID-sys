import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';

export function useUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const selected = useMemo(() => users.find((u) => u.id === selectedId) || null, [users, selectedId]);

  useEffect(() => {
    let cancelled = false;
    async function fetchUsers() {
      try {
        const res = await api.users();
        const mapped = Array.isArray(res) ? res.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role
            .replace('mayorsoffice', 'Mayor')
            .replace('spearhead', 'Spearhead')
            .replace('barangay', 'Barangay')
            .replace('ngo', 'NGO')
            .replace('admin', 'Admin'),
          status: u.status === 'active' ? 'Active' : u.status === 'pending' ? 'Pending' : u.status === 'offline' ? 'Offline' : u.status === 'archived' ? 'Archived' : u.status,
          location: u.location || '—',
          date: u.date_created
            ? new Date(u.date_created).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
            : u.date_created,
        })) : [];
        if (!cancelled) {
          setUsers(mapped);
          if (mapped.length > 0 && selectedId === null) {
            setSelectedId(mapped[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchUsers();
    return () => { cancelled = true; };
  }, [selectedId]);

  const updateUser = useMemo(() => (id, updates) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));
  }, []);

  const addUser = useMemo(() => (user) => {
    setUsers((prev) => [user, ...prev]);
  }, []);

  return { users, loading, selected, selectedId, setSelectedId, updateUser, addUser };
}
