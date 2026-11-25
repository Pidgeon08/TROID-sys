// The parts ("features") of the system a backup holds. A backup holds them all; a restore puts
// back those in the file, each with the features it needs (requests need the robots, operators and collection areas they
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

/** The features a backup file holds (an old version 1 file holds them all). */
export function featuresInFile(backup, features) {
  if (Array.isArray(backup?.features)) return withNeeds(backup.features, features);
  return features.map((f) => f.key);
}
