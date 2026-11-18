import { useEffect, useState, useSyncExternalStore } from 'react'
import { z } from 'zod'

const tabSchema = z.enum(['dashboard', 'attendance', 'roster', 'summary'])
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
  const query = sanitizedSearch(search)
  const view =
    z
      .enum([
        'settings',
        'administration',
        'add-student',
        'notebook',
        'courses',
        'student',
        'profile',
        'history',
      ])
      .safeParse(query.get('view')).data ?? 'notebook'
  return {
    page: z.enum(['home', 'app']).safeParse(query.get('page')).data ?? 'home',
    view: view === 'notebook' && query.get('tab') === 'history' ? 'history' : view,
    tab: tabSchema.safeParse(query.get('tab')).data ?? 'dashboard',
    date: z.iso.date().safeParse(query.get('date')).data ?? today(),
    from: z.iso.date().safeParse(query.get('from')).data ?? today().slice(0, 7) + '-01',
    to: z.iso.date().safeParse(query.get('to')).data ?? today(),
    q: query.get('q') ?? '',
    group: query.get('group') ?? '',
    student: query.get('student') ?? '',
    account: z.string().min(1).max(256).safeParse(query.get('account')).data ?? '',
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
  'student',
  'account',
  'course',
  'courseView',
  'all',
  'tables',
])
export function sanitizedSearch(search: string) {
  const query = new URLSearchParams(search)
  for (const key of [...query.keys()]) if (!allowedKeys.has(key)) query.delete(key)
  if (query.get('tab') === 'notes') {
    query.set('tab', 'attendance')
    for (const key of ['from', 'to', 'student', 'q', 'group']) query.delete(key)
  }
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

const coursePreferenceSchema = z.union([z.literal(''), z.uuid()])
const coursePreferenceKey = (accountId: string) => `halaqa-course:${accountId}`

function saveCoursePreference(accountId: string, course: string) {
  try {
    localStorage.setItem(coursePreferenceKey(accountId), JSON.stringify(course))
  } catch {
    // The URL remains usable when preference storage is unavailable.
  }
}

export function useCoursePreference(
  accountId: string | undefined,
  loaded: boolean,
  courses: { id: string }[],
) {
  const [ready, setReady] = useState(!accountId)
  const [defaultCourse, setDefaultCourse] = useState('')
  useEffect(() => {
    if (!accountId || !loaded || ready) return
    let selection = ''
    try {
      const stored = localStorage.getItem(coursePreferenceKey(accountId))
      if (stored !== null)
        selection = coursePreferenceSchema.safeParse(JSON.parse(stored)).data ?? ''
    } catch {
      // Ignore an unavailable or malformed preference.
    }
    if (selection && !courses.some((course) => course.id === selection)) selection = ''
    const query = new URLSearchParams(window.location.search)
    const notebook = !query.has('view') || query.get('view') === 'notebook'
    const explicit = query.get('course')
    if (notebook && explicit === null && selection) setQuery({ course: selection })
    else if (
      explicit &&
      explicit !== 'all' &&
      explicit !== 'none' &&
      (!z.uuid().safeParse(explicit).success || !courses.some((course) => course.id === explicit))
    ) {
      setQuery({ course: 'none' })
    }
    // oxlint-disable-next-line react/set-state-in-effect
    setDefaultCourse(selection)
    setReady(true)
  }, [accountId, loaded, courses, ready])
  function chooseDefault(course: string) {
    if (accountId) saveCoursePreference(accountId, course)
    setDefaultCourse(course)
    setQuery({ course: course || 'none', student: '' }, true)
  }
  return { ready, defaultCourse, chooseDefault }
}

export function navigateNotebook(
  tab: Tab,
  defaultCourse: string | undefined,
  values: Record<string, string> = {},
) {
  setQuery(
    {
      ...values,
      view: 'notebook',
      tab,
      course: defaultCourse === undefined ? '' : defaultCourse || 'none',
    },
    true,
  )
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
