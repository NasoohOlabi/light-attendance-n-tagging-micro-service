export function rankAbsenceSessions<T extends { absent: number; date: string }>(sessions: T[]) {
  return sessions.sort((a, b) => b.absent - a.absent || b.date.localeCompare(a.date))
}
