import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A list's filters, kept in the page URL so Back and refreshing keep them. `fromParams` and
 * `toParams` convert between the URL and the filters. `update` merges changes in; `reset`
 * clears every filter but the sort order and then applies `changes`; `clear` is reset().
 */
export function useUrlFilters({ fromParams, toParams, empty }) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => fromParams(params), [params, fromParams]);

  const update = useCallback(
    (changes) => setParams((prev) => toParams({ ...fromParams(prev), ...changes }), { replace: true }),
    [setParams, fromParams, toParams]
  );

  const reset = useCallback(
    (changes = {}) => setParams(
      (prev) => toParams({ ...empty, sort: fromParams(prev).sort, ...changes }),
      { replace: true }
    ),
    [setParams, fromParams, toParams, empty]
  );

  const clear = useCallback(() => reset(), [reset]);

  return { filters, update, clear, reset };
}
