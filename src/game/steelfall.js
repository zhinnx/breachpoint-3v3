/**
 * BREACHPOINT — Active map facade.
 *
 * Historically this file WAS the map. It is now a live view onto whichever map
 * the registry has active, so the eight modules that import from here (raycast,
 * navmesh, movement, ai, store, HUD, renderer, App) need no changes when the
 * map switches.
 *
 * Values that change per map are exposed as getters. Plain `const` exports
 * would snapshot the old map at import time, which is exactly the bug this
 * indirection exists to prevent.
 */
import { getActiveMap, setActiveMap, getActiveMapId, onMapChange, MAPS } from './mapRegistry.js';

export { setActiveMap, getActiveMapId, onMapChange, MAPS };

const m = () => getActiveMap();

export const getMapName = () => m().MAP_NAME;

// Live bindings. Each read hits the currently active map.
export const MAP_NAME = new Proxy({}, { get: (_, k) => m().MAP_NAME[k] });

export function inBuyZone(team, pos) { return m().inBuyZone(team, pos); }

// Geometry + gameplay data
export const getPLAY = () => m().PLAY;
export const getBrushes = () => m().brushes;
export const getSOLIDS = () => m().SOLIDS;
export const getCOLLIDERS = () => m().COLLIDERS;
export const getSPAWNS = () => m().SPAWNS;
export const getCOVER_POINTS = () => m().COVER_POINTS;
export const getLANE_PUSH_POINTS = () => m().LANE_PUSH_POINTS;
export const getNAV_REGIONS = () => m().NAV_REGIONS;
export const getRAMPS = () => m().RAMPS;
export const getLADDERS = () => m().LADDERS;
export const getLEVEL = () => m().LEVEL;
export const getWALL_H = () => m().WALL_H;
export const getSODIUM_LAMPS = () => m().SODIUM_LAMPS;
export const getMOON_SHAFTS = () => m().MOON_SHAFTS;
export const getMAP_META = () => m().MAP_META;
export const getBUY_ZONES = () => m().BUY_ZONES;
export const isOutdoor = () => !!m().OUTDOOR;
export const getPracticeRoutes = () => m().PRACTICE_ROUTES || [];

/**
 * Array-like live proxies. Consumers iterate these with for..of, .filter,
 * .length and index access, all of which forward to the active map's array.
 */
function liveArray(pick) {
  return new Proxy([], {
    get(_, prop) {
      const arr = pick() || [];
      const v = arr[prop];
      return typeof v === 'function' ? v.bind(arr) : v;
    },
    has: (_, prop) => prop in (pick() || []),
    ownKeys: () => Reflect.ownKeys(pick() || []),
    getOwnPropertyDescriptor: (_, prop) =>
      Object.getOwnPropertyDescriptor(pick() || [], prop),
  });
}

function liveObject(pick) {
  return new Proxy({}, {
    get(_, prop) {
      const o = pick() || {};
      const v = o[prop];
      return typeof v === 'function' ? v.bind(o) : v;
    },
    has: (_, prop) => prop in (pick() || {}),
    ownKeys: () => Reflect.ownKeys(pick() || {}),
    getOwnPropertyDescriptor: (_, prop) =>
      Object.getOwnPropertyDescriptor(pick() || {}, prop),
  });
}

export const PLAY = liveObject(getPLAY);
export const LEVEL = liveObject(getLEVEL);
export const SPAWNS = liveObject(getSPAWNS);
export const BUY_ZONES = liveObject(getBUY_ZONES);
export const LANE_PUSH_POINTS = liveObject(getLANE_PUSH_POINTS);
export const MAP_META = liveObject(getMAP_META);

export const brushes = liveArray(getBrushes);
export const SOLIDS = liveArray(getSOLIDS);
export const COLLIDERS = liveArray(getCOLLIDERS);
export const COVER_POINTS = liveArray(getCOVER_POINTS);
export const NAV_REGIONS = liveArray(getNAV_REGIONS);
export const RAMPS = liveArray(getRAMPS);
export const LADDERS = liveArray(getLADDERS);
export const SODIUM_LAMPS = liveArray(getSODIUM_LAMPS);
export const MOON_SHAFTS = liveArray(getMOON_SHAFTS);

export const WALL_H = 8.5;
