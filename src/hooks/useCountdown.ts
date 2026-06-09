import { useState, useEffect } from 'react';
import { formatCountdown } from '../lib/utils';

/**
 * Returns a live countdown string that updates every second.
 * @param targetDate - ISO date string of the kickoff time
 */
export function useCountdown(targetDate: string): string {
  const [display, setDisplay] = useState(() => formatCountdown(targetDate));

  useEffect(() => {
    if (!targetDate) return;
    setDisplay(formatCountdown(targetDate));
    const id = setInterval(() => setDisplay(formatCountdown(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return display;
}
