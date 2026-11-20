// Short ages for rows: "now", "5m", "2h", "3d". From herdr-agent-ask's state.js and the Herdr
// app's agents mod (MIT and Apache-2.0, see NOTICE); changed for helm: one module.

// Milliseconds as "now", "5m", "2h", "3d".
export function age(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// Like age, but under a minute is "<1m" (the agents list's durations).
export const duration = (ms) => (ms < 60000 ? "<1m" : age(ms));

// "2026-11-20 14:05" in local time, for log lines.
export function stamp(at) {
  const d = new Date(at), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
