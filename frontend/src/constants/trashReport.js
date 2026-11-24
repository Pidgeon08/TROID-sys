// The trash report filed when a cleanup is finished, after the International Coastal Cleanup
// data card (Shoreline and Recreational items). The item names match drives.TRASH_ITEMS in the
// backend, which also maps the robot's class names onto them for TROID-supported cleanups.

export const TRASH_ITEMS = [
  "Bags (paper or plastic)",
  "Balloons",
  "Beverage bottles (plastic)",
  "Beverage bottles (glass)",
  "Beverage cans",
  "Caps, lids",
  "Clothing, shoes",
  "Cups, plates, forks, knives, spoons",
  "Food wrappers, containers",
  "Pull tabs",
  "6-pack holders",
  "Shotgun shells, wadding",
  "Straws, stirrers",
  "Toys",
  "Other items",
];

// Request.SITE_TYPE_CHOICES in the backend.
export const SITE_TYPES = [
  { value: "shoreline", label: "Shoreline or beach" },
  { value: "river", label: "River, stream or tributary" },
  { value: "lake", label: "Lake or pond" },
];

export const siteTypeLabel = (value) => SITE_TYPES.find((t) => t.value === value)?.label || "";

// A collection area's water body type (constants/collectionAreas.js) as a data card site type.
const SITE_TYPE_OF_WATER = {
  coast: "shoreline",
  estuary: "river",
  river: "river",
  creek: "river",
  canal: "river",
  pond: "lake",
};

export const siteTypeForWater = (waterBodyType) => SITE_TYPE_OF_WATER[waterBodyType] || "";

export const ANIMAL_CONDITIONS = [
  { value: "alive", label: "Alive" },
  { value: "dead", label: "Dead" },
];

/**
 * The items of a filed report worth listing: those with any pieces, data card items first.
 * Reports filed before the data card was used have their own categories, listed after.
 */
export function reportedItems(counts = {}) {
  const others = Object.keys(counts).filter((name) => !TRASH_ITEMS.includes(name)).sort();
  return [...TRASH_ITEMS, ...others]
    .filter((name) => Number(counts[name]) > 0)
    .map((name) => ({ name, count: Number(counts[name]) }));
}
