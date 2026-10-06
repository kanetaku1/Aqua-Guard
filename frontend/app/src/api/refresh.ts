/** Live data is refetched every 5 minutes — the backend reads InfluxDB on the same cycle (04 §2). */
export const LIVE_REFRESH_MS = 5 * 60 * 1000

export const liveQuery = { refetchInterval: LIVE_REFRESH_MS, refetchIntervalInBackground: false } as const
