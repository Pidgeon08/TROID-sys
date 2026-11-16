// Choosing parts ("features") of the system to back up or restore. A feature always comes
// with the features it needs (requests need the robots, operators and collection areas they
// point at), the same rule the server applies (backend/troid_api/backup.py).

/** The chosen features plus everything they need, in the features' own order. */
export function withNeeds(keys, features) {
  const byKey = new Map(features.map((f) => [f.key, f]));
  const chosen = new Set();
  const pending = [...keys];
  while (pending.length) {
    const key = pending.pop();
    if (chosen.has(key) || !byKey.has(key)) continue;
    chosen.add(key);
    pending.push(...byKey.get(key).needs);
  }
  return features.filter((f) => chosen.has(f.key)).map((f) => f.key);
}

/** For each feature included only because another needs it, the label of one that does. */
export function requiredBy(explicit, features) {
  const included = new Set(withNeeds([...explicit], features));
  const labels = new Map(features.map((f) => [f.key, f.label]));
  const result = {};
  features.forEach((f) => {
    if (!included.has(f.key) || explicit.has(f.key)) return;
    const needer = features.find((other) => included.has(other.key) && other.needs.includes(f.key));
    if (needer) result[f.key] = labels.get(needer.key);
  });
  return result;
}

/** How many records of each feature a backup file holds, from its counts by table. */
export function countsInFile(backup, features) {
  const counts = backup?.counts || {};
  return Object.fromEntries(features.map((f) => [f.key, f.parts.reduce((sum, p) => sum + (counts[p.model] || 0), 0)]));
}

/** The features a backup file holds (an old version 1 file holds them all). */
export function featuresInFile(backup, features) {
  if (Array.isArray(backup?.features)) return withNeeds(backup.features, features);
  return features.map((f) => f.key);
}
