import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { EMPTY_FILTERS, filtersFromParams, filtersToParams } from "../utils/requestFilters";

/**
 * A request list's filters, kept in the page URL (so Back from a request and refreshing
 * keep them). `update` merges changes in; `clear` resets everything but the sort order.
 */
export function useRequestFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);

  const update = useCallback(
    (changes) => setParams((prev) => filtersToParams({ ...filtersFromParams(prev), ...changes }), { replace: true }),
    [setParams]
  );

  const clear = useCallback(
    () => setParams((prev) => filtersToParams({ ...EMPTY_FILTERS, sort: filtersFromParams(prev).sort }), { replace: true }),
    [setParams]
  );

  return { filters, update, clear };
}
