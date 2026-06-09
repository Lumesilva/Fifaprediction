import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCountdown(targetDate: string): string {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return 'Started';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function formatMatchDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

// Converts a datetime-local string entered as IST to a UTC ISO string for DB storage.
// datetime-local has no timezone, so we manually offset IST (+05:30).
export function istInputToUtcIso(localValue: string): string {
  if (!localValue) return '';
  // localValue is "YYYY-MM-DDTHH:mm"
  const date = new Date(localValue + ':00+05:30');
  return date.toISOString();
}

// Converts a UTC ISO string from DB to a datetime-local value shown in IST.
export function utcIsoToIstInput(isoStr: string): string {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  // Format as "YYYY-MM-DDTHH:mm" in IST
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 16);
}

export function isPredictionLocked(kickoffTime: string): boolean {
  return new Date(kickoffTime).getTime() <= Date.now();
}

export function getPredictionAccuracy(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

export const STAGES = [
  'Group Stage', 'Round of 32', 'Round of 16',
  'Quarter Final', 'Semi Final', 'Third Place', 'Final',
] as const;

export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
