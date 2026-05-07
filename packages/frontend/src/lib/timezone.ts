export interface TimezoneGroup {
  offset: string;
  offsetMinutes: number;
  iana: string;
  cities: string[];
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = [
  { offset: "UTC-12", offsetMinutes: -720, iana: "Etc/GMT+12", cities: ["Baker Island", "Howland Island"] },
  { offset: "UTC-11", offsetMinutes: -660, iana: "Pacific/Niue", cities: ["Niue", "Pago Pago", "Midway Island"] },
  { offset: "UTC-10", offsetMinutes: -600, iana: "Pacific/Honolulu", cities: ["Honolulu", "Tahiti", "Papeete"] },
  { offset: "UTC-9", offsetMinutes: -540, iana: "America/Anchorage", cities: ["Anchorage", "Juneau", "Fairbanks"] },
  { offset: "UTC-8", offsetMinutes: -480, iana: "America/Los_Angeles", cities: ["Los Angeles", "San Francisco", "Seattle", "Vancouver"] },
  { offset: "UTC-7", offsetMinutes: -420, iana: "America/Denver", cities: ["Denver", "Phoenix", "Calgary", "Salt Lake City"] },
  { offset: "UTC-6", offsetMinutes: -360, iana: "America/Chicago", cities: ["Chicago", "Houston", "Dallas", "Mexico City"] },
  { offset: "UTC-5", offsetMinutes: -300, iana: "America/New_York", cities: ["New York", "Toronto", "Miami", "Bogotá"] },
  { offset: "UTC-4", offsetMinutes: -240, iana: "America/Halifax", cities: ["Halifax", "Caracas", "La Paz", "Manaus"] },
  { offset: "UTC-3", offsetMinutes: -180, iana: "America/Sao_Paulo", cities: ["São Paulo", "Buenos Aires", "Montevideo"] },
  { offset: "UTC-2", offsetMinutes: -120, iana: "Atlantic/South_Georgia", cities: ["South Georgia"] },
  { offset: "UTC-1", offsetMinutes: -60, iana: "Atlantic/Cape_Verde", cities: ["Cape Verde", "Azores"] },
  { offset: "UTC+0", offsetMinutes: 0, iana: "Europe/London", cities: ["London", "Dublin", "Lisbon", "Casablanca"] },
  { offset: "UTC+1", offsetMinutes: 60, iana: "Europe/Paris", cities: ["Paris", "Berlin", "Madrid", "Rome", "Lagos"] },
  { offset: "UTC+2", offsetMinutes: 120, iana: "Europe/Athens", cities: ["Athens", "Cairo", "Johannesburg", "Kyiv"] },
  { offset: "UTC+3", offsetMinutes: 180, iana: "Europe/Moscow", cities: ["Moscow", "Nairobi", "Riyadh", "Istanbul"] },
  { offset: "UTC+3:30", offsetMinutes: 210, iana: "Asia/Tehran", cities: ["Tehran"] },
  { offset: "UTC+4", offsetMinutes: 240, iana: "Asia/Dubai", cities: ["Dubai", "Baku", "Tbilisi", "Muscat"] },
  { offset: "UTC+4:30", offsetMinutes: 270, iana: "Asia/Kabul", cities: ["Kabul"] },
  { offset: "UTC+5", offsetMinutes: 300, iana: "Asia/Karachi", cities: ["Karachi", "Tashkent", "Islamabad"] },
  { offset: "UTC+5:30", offsetMinutes: 330, iana: "Asia/Kolkata", cities: ["Mumbai", "Delhi", "Kolkata", "Chennai"] },
  { offset: "UTC+5:45", offsetMinutes: 345, iana: "Asia/Kathmandu", cities: ["Kathmandu"] },
  { offset: "UTC+6", offsetMinutes: 360, iana: "Asia/Dhaka", cities: ["Dhaka", "Almaty", "Omsk"] },
  { offset: "UTC+6:30", offsetMinutes: 390, iana: "Asia/Yangon", cities: ["Yangon", "Mandalay"] },
  { offset: "UTC+7", offsetMinutes: 420, iana: "Asia/Bangkok", cities: ["Bangkok", "Jakarta", "Hanoi", "Ho Chi Minh City"] },
  { offset: "UTC+8", offsetMinutes: 480, iana: "Asia/Shanghai", cities: ["Beijing", "Shanghai", "Singapore", "Kuala Lumpur"] },
  { offset: "UTC+9", offsetMinutes: 540, iana: "Asia/Tokyo", cities: ["Tokyo", "Seoul", "Osaka"] },
  { offset: "UTC+9:30", offsetMinutes: 570, iana: "Australia/Darwin", cities: ["Darwin", "Alice Springs", "Adelaide"] },
  { offset: "UTC+10", offsetMinutes: 600, iana: "Australia/Sydney", cities: ["Sydney", "Melbourne", "Brisbane", "Canberra"] },
  { offset: "UTC+11", offsetMinutes: 660, iana: "Pacific/Guadalcanal", cities: ["Honiara", "Noumea", "Vladivostok"] },
  { offset: "UTC+12", offsetMinutes: 720, iana: "Pacific/Auckland", cities: ["Auckland", "Wellington", "Suva", "Fiji"] },
];

export function detectTimezoneGroup(): TimezoneGroup | undefined {
  const detectedIana = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const exact = TIMEZONE_GROUPS.find(g => g.iana === detectedIana);
  if (exact) return exact;
  // Fall back to current UTC offset for zones not in our curated list.
  // This has a DST blind spot (offset shifts by 1h in summer) but is best-effort.
  const offsetMinutes = -new Date().getTimezoneOffset();
  return TIMEZONE_GROUPS.reduce<TimezoneGroup | undefined>((best, g) => {
    if (!best) return g;
    return Math.abs(g.offsetMinutes - offsetMinutes) <= Math.abs(best.offsetMinutes - offsetMinutes) ? g : best;
  }, undefined);
}

export function getTimezoneGroup(iana: string): TimezoneGroup | undefined {
  return TIMEZONE_GROUPS.find(g => g.iana === iana);
}

export function formatTimezoneLabel(group: TimezoneGroup): string {
  return `(${group.offset}) ${group.cities.slice(0, 4).join(", ")}`;
}

export function formatTimeInZone(tz: string): string {
  return new Date().toLocaleTimeString(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}
