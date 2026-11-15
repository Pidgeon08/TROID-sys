// Details kept about each collection area, for the operator and the workers who go there.
// Water body types match CollectionArea.WATER_BODY_CHOICES in the backend.
export const WATER_BODY_TYPES = [
  { value: "river", label: "River" },
  { value: "creek", label: "Creek" },
  { value: "coast", label: "Coast or shoreline" },
  { value: "estuary", label: "Estuary or river mouth" },
  { value: "canal", label: "Drainage canal" },
  { value: "pond", label: "Pond or lagoon" },
  { value: "other", label: "Other" },
];

export const waterBodyLabel = (value) => WATER_BODY_TYPES.find((t) => t.value === value)?.label || "";

export const EMPTY_AREA_DETAILS = {
  description: "",
  waterBodyType: "",
  waterBodyName: "",
  hazards: "",
};

const API_NAMES = {
  description: "description",
  waterBodyType: "water_body_type",
  waterBodyName: "water_body_name",
  hazards: "hazards",
};

/** The details of an area as the API sends it. */
export function areaDetailsFromApi(raw) {
  return Object.fromEntries(Object.entries(API_NAMES).map(([key, apiName]) => [key, raw?.[apiName] || ""]));
}

/** Just the details of an area (or a form holding them). */
export function pickAreaDetails(obj) {
  return Object.fromEntries(Object.keys(EMPTY_AREA_DETAILS).map((key) => [key, obj?.[key] || ""]));
}

/** The details, trimmed, as the API takes them. */
export function areaDetailsToApi(details) {
  return Object.fromEntries(
    Object.entries(API_NAMES).map(([key, apiName]) => [apiName, String(details?.[key] || "").trim()])
  );
}

export const hasAreaDetails = (area) => Object.keys(EMPTY_AREA_DETAILS).some((key) => area?.[key]);
