import { EMPTY_FILTERS, filtersFromParams, filtersToParams } from "../utils/requestFilters";
import { useUrlFilters } from "./useUrlFilters";

const OPTIONS = { fromParams: filtersFromParams, toParams: filtersToParams, empty: EMPTY_FILTERS };

/** A request list's filters, kept in the page URL. `clear` keeps the sort order. */
export function useRequestFilters() {
  const { filters, update, clear } = useUrlFilters(OPTIONS);
  return { filters, update, clear };
}
