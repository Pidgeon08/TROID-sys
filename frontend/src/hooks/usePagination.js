import { useState, useCallback } from 'react';

export function usePagination(totalItems, pageSize = 5) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginated = totalItems === 0 ? [] : Array.from({ length: Math.min(pageSize, totalItems - (page - 1) * pageSize) }, (_, i) => (page - 1) * pageSize + i);

  const goTo = useCallback((p) => setPage(Math.max(1, Math.min(totalPages, p))), [totalPages]);
  const next = useCallback(() => goTo(page + 1), [page, goTo]);
  const prev = useCallback(() => goTo(page - 1), [page, goTo]);

  return { page, setPage: goTo, totalPages, paginated, next, prev, hasNext: page < totalPages, hasPrev: page > 1 };
}
