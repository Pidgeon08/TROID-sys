import { useCallback, useState } from 'react';

// How many items a list shows per page, remembered in this browser per list (`key`).
// Browser storage can be unavailable (private windows, blocked site data); the list then
// just starts at its default.
export function usePageSize(key, defaultSize) {
  const storageKey = `troid.pageSize.${key}`;
  const [pageSize, setPageSizeState] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      return saved > 0 ? saved : defaultSize;
    } catch {
      return defaultSize;
    }
  });

  const setPageSize = useCallback((size) => {
    setPageSizeState(size);
    try {
      localStorage.setItem(storageKey, String(size));
    } catch {
      // Not remembered this time; the list still uses the new size.
    }
  }, [storageKey]);

  return [pageSize, setPageSize];
}

/** The page that keeps the first item now shown in view after the page size changes. */
export function pageKeepingPlace(page, oldSize, newSize) {
  return Math.floor(((page - 1) * oldSize) / newSize) + 1;
}
