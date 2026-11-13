import { useSyncExternalStore } from 'react'
import { z } from 'zod'

export const tabSchema = z.enum(['attendance', 'notes', 'roster', 'summary', 'history'])
export type Tab = z.infer<typeof tabSchema>
export function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  return () => window.removeEventListener('popstate', callback)
}
export function useQueryState() {
  const search = useSyncExternalStore(subscribe, () => window.location.search)
  const query = new URLSearchParams(search)
  return {
    page: z.enum(['home', 'app']).safeParse(query.get('page')).data ?? 'home',
    tab: tabSchema.safeParse(query.get('tab')).data ?? 'attendance',
    date: z.iso.date().safeParse(query.get('date')).data ?? today(),
    from: z.iso.date().safeParse(query.get('from')).data ?? today().slice(0, 7) + '-01',
    to: z.iso.date().safeParse(query.get('to')).data ?? today(),
    q: query.get('q') ?? '',
    group: query.get('group') ?? '',
    tag: query.get('tag') ?? '',
    student: query.get('student') ?? '',
    all: query.get('all') === '1',
  }
}
const allowedKeys = new Set([
  'page',
  'tab',
  'date',
  'from',
  'to',
  'q',
  'group',
  'tag',
  'student',
  'all',
])
export function sanitizedSearch(search: string) {
  const query = new URLSearchParams(search)
  for (const key of [...query.keys()]) if (!allowedKeys.has(key)) query.delete(key)
  return query
}
export function setQuery(values: Record<string, string>, push = false) {
  const query = sanitizedSearch(window.location.search)
  for (const [key, value] of Object.entries(values)) {
    if (!allowedKeys.has(key)) continue
    if (value) query.set(key, value)
    else query.delete(key)
  }
  const search = query.toString()
  window.history[push ? 'pushState' : 'replaceState'](
    null,
    '',
    window.location.pathname + (search ? `?${search}` : ''),
  )
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigatePage(page: 'home' | 'app') {
  window.history.pushState(null, '', window.location.pathname + (page === 'app' ? '?page=app' : ''))
  window.dispatchEvent(new PopStateEvent('popstate'))
}
