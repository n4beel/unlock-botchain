/**
 * Protocol limits matching Unlock.sol
 */
export const MIN_WINDOW = 3600; // 1 hour
export const MAX_WINDOW = 604800; // 7 days
export const MAX_LABEL = 64; // 64 bytes

export const WINDOW_PRESETS = [
  { label: "1 Hour", secs: 3600 },
  { label: "6 Hours", secs: 21600 },
  { label: "24 Hours", secs: 86400 },
  { label: "3 Days", secs: 259200 },
  { label: "7 Days", secs: 604800 },
] as const;
