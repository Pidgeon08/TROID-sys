import { useState, useEffect } from 'react';
import { API_BASE } from '../../services/api';

export function useApi(path) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(Array.isArray(json) ? json : []);
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; controller.abort(); };
  }, [path]);

  return { data, loading, error };
}
