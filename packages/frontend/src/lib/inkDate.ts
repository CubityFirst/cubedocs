// Formats an Annex Ink "supporter since" date as e.g. "10th of May, 2026".
// Used in both UserSettingsPage and UserProfileCard so the format stays
// consistent. Returns null for null/undefined input so callers can branch
// on whether a date is even available.

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export function formatInkSince(unixMs: number | null | undefined): string | null {
  if (unixMs == null) return null;
  const d = new Date(unixMs);
  const day = d.getDate();
  const month = d.toLocaleString(undefined, { month: "long" });
  const year = d.getFullYear();
  return `${day}${ordinalSuffix(day)} of ${month}, ${year}`;
}
