// The trash report filed when a cleanup is finished. It counts the items of the International
// Coastal Cleanup data card (Shoreline and Recreational), grouped under the TROID classes: what the
// robot sorts trash into. A class's count is the sum of its items, and is what the robot's own
// count is compared with. Matches drives.TROID_CLASSES and drives.TRASH_GROUPS in the backend.

export const TROID_CLASSES = ["Plastic", "Metal", "Glass", "Paper/Cardboard", "Organic/Biodegradable", "Other"];

export const TRASH_GROUPS = [
  {
    cls: "Plastic",
    items: [
      "Plastic bags", "Beverage bottles (plastic)", "Caps, lids", "Cups, plates, forks, knives, spoons",
      "Food wrappers, containers", "Straws, stirrers", "6-pack holders", "Toys", "Shotgun shells, wadding", "Other plastic",
    ],
  },
  { cls: "Metal", items: ["Beverage cans", "Pull tabs", "Other metal"] },
  { cls: "Glass", items: ["Beverage bottles (glass)", "Other glass"] },
  { cls: "Paper/Cardboard", items: ["Paper bags", "Other paper or cardboard"] },
  { cls: "Organic/Biodegradable", items: ["Organic waste"] },
  { cls: "Other", items: ["Clothing, shoes", "Balloons", "Other items"] },
];

export const TRASH_ITEMS = TRASH_GROUPS.flatMap((g) => g.items);

/** Each TROID class's count: the sum of its items' counts (drives.class_totals). */
export function classTotals(items = {}) {
  return Object.fromEntries(TRASH_GROUPS.map((g) => [g.cls, g.items.reduce((sum, item) => sum + (Number(items[item]) || 0), 0)]));
}

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

/** How the reported count of a class compares with what TROID counted. */
export function readAccuracy(reported, counted) {
  if (counted === null || counted === undefined) return null;
  const diff = reported - counted;
  if (diff === 0) return { tone: "match", text: "Matches TROID" };
  return { tone: "off", text: `${Math.abs(diff).toLocaleString()} ${diff > 0 ? "more" : "fewer"} than TROID` };
}

/**
 * A filed report by TROID class: each class's count, with the items behind it that have any
 * pieces. Reports filed before items were counted only have their class counts.
 */
export function reportByClass(classCounts = {}, items = {}) {
  const others = Object.keys(classCounts).filter((name) => !TROID_CLASSES.includes(name)).sort();
  return [
    ...TRASH_GROUPS.map((g) => ({
      cls: g.cls,
      count: Number(classCounts[g.cls]) || 0,
      items: g.items.filter((item) => Number(items[item]) > 0).map((item) => ({ name: item, count: Number(items[item]) })),
    })),
    ...others.map((name) => ({ cls: name, count: Number(classCounts[name]) || 0, items: [] })),
  ];
}
