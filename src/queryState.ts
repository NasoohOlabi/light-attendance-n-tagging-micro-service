import { useSyncExternalStore } from 'react'
import { z } from 'zod'

export const tabSchema = z.enum([
  'dashboard',
  'attendance',
  'notes',
  'roster',
  'summary',
  'history',
])
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
    view:
      z
        .enum(['settings', 'administration', 'add-student', 'notebook', 'courses', 'student'])
        .safeParse(query.get('view')).data ?? 'notebook',
    tab: tabSchema.safeParse(query.get('tab')).data ?? 'dashboard',
    date: z.iso.date().safeParse(query.get('date')).data ?? today(),
    from: z.iso.date().safeParse(query.get('from')).data ?? today().slice(0, 7) + '-01',
    to: z.iso.date().safeParse(query.get('to')).data ?? today(),
    q: query.get('q') ?? '',
    group: query.get('group') ?? '',
    tag: query.get('tag') ?? '',
    student: query.get('student') ?? '',
    course: z.uuid().safeParse(query.get('course')).data ?? '',
    courseView:
      z.enum(['create', 'edit', 'students', 'grades']).safeParse(query.get('courseView')).data ??
      '',
    all: query.get('all') === '1',
  }
}
const allowedKeys = new Set([
  'page',
  'tab',
  'view',
  'date',
  'from',
  'to',
  'q',
  'group',
  'tag',
  'student',
  'course',
  'courseView',
  'all',
  'tables',
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
  window.scrollTo(0, 0)
}

const tableStateSchema = z.object({
  sorting: z.array(z.object({ id: z.string().max(100), desc: z.boolean() })).max(30),
  filters: z.array(z.object({ id: z.string().max(100), value: z.string().max(200) })).max(30),
})
type TableState = z.infer<typeof tableStateSchema>
const emptyTableState: TableState = { sorting: [], filters: [] }
function readTableStates(search: string) {
  const raw = new URLSearchParams(search).get('tables')
  if (!raw || raw.length > 10000) return {}
  try {
    return z.record(z.string().max(100), tableStateSchema).safeParse(JSON.parse(raw)).data ?? {}
  } catch {
    return {}
  }
}
export function useTableQuery(id: string) {
  const search = useSyncExternalStore(subscribe, () => window.location.search)
  return readTableStates(search)[id] ?? emptyTableState
}
export function setTableQuery(id: string, state: TableState) {
  const states = readTableStates(window.location.search)
  if (!state.sorting.length && !state.filters.length) delete states[id]
  else states[id] = state
  setQuery({ tables: Object.keys(states).length ? JSON.stringify(states) : '' })
}
