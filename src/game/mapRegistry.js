/**
 * BREACHPOINT — Active-map registry.
 *
 * Eight modules import map data directly, so rather than rewrite every call
 * site the game keeps a single "active map" here and `steelfall.js` re-exports
 * live getters that read from it. Switching maps is therefore one call, and the
 * raycaster / navmesh / renderer all follow automatically.
 *
 * Anything that caches derived data from a map (the AABB spatial hash, the
 * baked navmesh) registers an invalidation hook so a switch cannot leave stale
 * geometry behind — that would silently break line-of-sight and pathing.
 */
import * as dustline from './maps/dustline.js';
import * as rangeyard from './maps/rangeyard.js';

export const MAPS = {
  dustline,
  rangeyard,
};

let active = dustline;
const listeners = new Set();

/** Called by modules that cache map-derived structures. */
export function onMapChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveMap() {
  return active;
}

export function getActiveMapId() {
  return active === rangeyard ? 'rangeyard' : 'dustline';
}

export function setActiveMap(id) {
  const next = MAPS[id];
  if (!next) throw new Error(`Unknown map: ${id}`);
  if (next === active) return active;
  active = next;
  for (const fn of listeners) fn(active);
  return active;
}
