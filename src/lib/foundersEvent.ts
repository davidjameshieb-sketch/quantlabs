// Founders Intelligence Access — 30-Day Expansion Window
// Central event configuration and countdown logic

// Fixed event window: 30 days from launch
export const FOUNDERS_EVENT_START = new Date('2026-02-08T00:00:00Z');
export const FOUNDERS_EVENT_END = new Date(
  FOUNDERS_EVENT_START.getTime() + 30 * 24 * 60 * 60 * 1000
);

export interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Calculate remaining time until event end */
export const getCountdown = (): CountdownTime => {
  const now = Date.now();
  const diff = FOUNDERS_EVENT_END.getTime() - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
};

/** Check if the Founders Access event is currently active */
export const isFoundersEventActive = (): boolean => {
  const now = Date.now();
  return now >= FOUNDERS_EVENT_START.getTime() && now < FOUNDERS_EVENT_END.getTime();
};

/** Format countdown as compact string */
export const formatCountdownCompact = (t: CountdownTime): string => {
  return `${String(t.days).padStart(2, '0')}d ${String(t.hours).padStart(2, '0')}h ${String(t.minutes).padStart(2, '0')}m ${String(t.seconds).padStart(2, '0')}s`;
};

/** Key for localStorage to track if user has seen the welcome overlay */
export const WELCOME_SEEN_KEY = 'quantlabs_founders_welcome_seen';
