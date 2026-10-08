// Base map tiles shared by every Leaflet map. CARTO's basemaps now require an
// API key, so these use OpenStreetMap's standard tiles (no key; fine for
// light use — see https://operations.osmfoundation.org/policies/tiles/).
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
