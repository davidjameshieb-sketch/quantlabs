import { useState, useEffect } from 'react';
import {
  getCountdown,
  isFoundersEventActive,
  type CountdownTime,
} from '@/lib/foundersEvent';

/** Shared hook for Founders Event countdown — ticks every second */
export const useFoundersCountdown = () => {
  const [time, setTime] = useState<CountdownTime>(getCountdown());
  const [active, setActive] = useState(isFoundersEventActive());

  useEffect(() => {
    const tick = () => {
      setTime(getCountdown());
      setActive(isFoundersEventActive());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return { time, active };
};
