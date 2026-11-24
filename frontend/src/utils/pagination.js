// Paging helpers shared by the Pagination component and the lists that use it.

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

/**
 * The page buttons to show: always the first and last page, the current one and its
 * neighbours, and "…" for the pages in between, so there are never more than 7 slots
 * however many pages there are.
 */
export function pageSlots(page, totalPages) {
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (totalPages <= 7) return range(1, totalPages);
  if (page <= 4) return [...range(1, 5), 'gap-end', totalPages];
  if (page >= totalPages - 3) return [1, 'gap-start', ...range(totalPages - 4, totalPages)];
  return [1, 'gap-start', page - 1, page, page + 1, 'gap-end', totalPages];
}
