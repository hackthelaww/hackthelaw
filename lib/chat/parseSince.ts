const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Best-effort relative-time parser for chat questions like "since Tuesday",
 * "in the last 2 hours", "since yesterday". Returns epoch ms, or null if no
 * recognizable relative reference is found (caller should fall back to "all time").
 */
export function parseSince(question: string, now: number = Date.now()): number | null {
  const q = question.toLowerCase();

  const hoursMatch = q.match(/last (\d+) hours?/);
  if (hoursMatch) return now - Number(hoursMatch[1]) * 3600_000;

  const daysMatch = q.match(/last (\d+) days?/);
  if (daysMatch) return now - Number(daysMatch[1]) * 86400_000;

  if (/\btoday\b/.test(q)) return startOfDay(now);
  if (/\byesterday\b/.test(q)) return startOfDay(now) - 86400_000;
  if (/\bthis week\b/.test(q)) return now - 7 * 86400_000;
  if (/\blast week\b/.test(q)) return now - 7 * 86400_000;

  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (q.includes(WEEKDAYS[i])) {
      const date = new Date(now);
      const todayDow = date.getDay();
      let diff = todayDow - i;
      if (diff <= 0) diff += 7;
      return startOfDay(now) - diff * 86400_000;
    }
  }

  return null;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
