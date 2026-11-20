import { useLanguage } from './useLanguage'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import {
  eventSchema,
  makeEvent,
  projectEvents,
  type LedgerEvent,
  type Payload,
} from '../shared/ledger'
import { assignedEvents, validateAssignedPayloads } from '../shared/roster'
import { demoEvents } from './demo'
import { apiUrl, getNotebook, postEvents } from './neon'
import type {
  Course,
  Enrollment,
  NeonTeacher,
  NeonRosterStudent,
  NeonSnapshot,
} from '../shared/neon'

const foreignPendingMessage =
  'A pending batch belongs to another account or an old link. Copy the pending batch from browser storage and contact your administrator to reconcile it before saving.'
const pendingLock = 'halaqa-pending'

function hasForeignPending(key: string) {
  return Object.keys(localStorage).some(
    (item) =>
      (item.startsWith('halaqa-pending-v1:') || item.startsWith('halaqa-pending-neon:')) &&
      item !== key,
  )
}

async function withPendingLocks<T>(key: string, run: () => Promise<T> | T): Promise<T> {
  return navigator.locks.request(pendingLock, { ifAvailable: true }, async (globalLock) => {
    if (!globalLock) throw new Error('Another tab is saving this account. Wait and try again.')
    return navigator.locks.request(key, { ifAvailable: true }, async (accountLock) => {
      if (!accountLock) throw new Error('Another tab is saving this account. Wait and try again.')
      return run()
    })
  })
}

export function useLedger(
  demo: boolean,
  assignedDemo = false,
  neon?: { userId: string; teacher: NeonTeacher },
) {
  const { t } = useLanguage()
  const neonUserId = neon?.userId
  const key = neon ? `halaqa-pending-neon:${apiUrl}:${neon.teacher.id}` : ''
  const [events, setEvents] = useState<LedgerEvent[]>(() => (demo ? demoEvents() : []))
  const [roster, setRoster] = useState<NeonRosterStudent[]>(() =>
    assignedDemo ? projectEvents(events).students.slice(0, 1) : [],
  )
  const [courses, setCourses] = useState<Course[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [snapshotTeacher, setSnapshotTeacher] = useState<NeonTeacher>()
  const [pending, setPending] = useState<LedgerEvent[]>([])
  const [storageBlocked, setStorageBlocked] = useState(() =>
    neon && !navigator.locks
      ? 'This browser cannot safely coordinate saves between tabs. Use a current browser with Web Locks support.'
      : '',
  )
  const [loaded, setLoaded] = useState(demo)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const invalid = 0
  const applySnapshot = useCallback((snapshot: NeonSnapshot) => {
    setSnapshotTeacher(snapshot.teacher)
    setEvents(snapshot.events)
    setRoster(snapshot.students)
    setCourses(snapshot.courses)
    setEnrollments(snapshot.enrollments)
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (!neonUserId) return
    try {
      const otherKey = hasForeignPending(key)
      const stored = localStorage.getItem(key)
      // Restore the external pending batch when this access session mounts.
      // oxlint-disable-next-line react/set-state-in-effect
      if (stored !== null) setPending(z.array(eventSchema).min(1).parse(JSON.parse(stored)))
      if (otherKey) {
        setStorageBlocked(foreignPendingMessage)
      }
    } catch {
      setStorageBlocked(
        'Pending storage is unavailable or a saved batch is corrupted. Keep a copy of browser storage and ask the manager for help before saving.',
      )
    }
    let cancelled = false
    getNotebook(neonUserId)
      .then((snapshot) => {
        if (!cancelled) applySnapshot(snapshot)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorText(cause))
      })
    return () => {
      cancelled = true
    }
  }, [key, neonUserId, applySnapshot])

  const refresh = useCallback(async () => {
    if (!neonUserId || locked.current) return false
    locked.current = true
    setBusy(true)
    try {
      const snapshot = await getNotebook(neonUserId)
      applySnapshot(snapshot)
      setError('')
      return true
    } catch (cause) {
      setError(errorText(cause))
      return false
    } finally {
      locked.current = false
      setBusy(false)
    }
  }, [neonUserId, applySnapshot])

  async function send(batch: LedgerEvent[], retry = false): Promise<boolean> {
    if (locked.current || !batch.length) return false
    locked.current = true
    setBusy(true)
    setError('')
    setMessage('')
    let writeStarted = false
    try {
      if (neon) {
        if (!navigator.locks) {
          setStorageBlocked(
            'This browser cannot safely coordinate saves between tabs. Use a current browser with Web Locks support.',
          )
          return false
        }
        const saved = await withPendingLocks(key, async () => {
          let foreign: boolean
          let existing: string | null
          try {
            foreign = hasForeignPending(key)
            existing = localStorage.getItem(key)
          } catch {
            const reason =
              'Could not persist the pending batch. No write was sent; restore browser storage before saving.'
            setStorageBlocked(reason)
            throw new Error(reason)
          }
          if (foreign) {
            setStorageBlocked(foreignPendingMessage)
            throw new Error(foreignPendingMessage)
          }
          const serialized = JSON.stringify(batch)
          if (retry ? existing !== serialized : existing !== null) {
            const reason = 'The pending batch changed in another tab. Reload before retrying.'
            setStorageBlocked(reason)
            throw new Error(reason)
          }
          if (!retry) {
            try {
              localStorage.setItem(key, serialized)
            } catch {
              const reason =
                'Could not persist the pending batch. No write was sent; restore browser storage before saving.'
              setStorageBlocked(reason)
              throw new Error(reason)
            }
          }
          setPending(batch)
          if (!neon.teacher.canWrite) throw new Error('Your account has read-only access.')
          const current = await getNotebook(neon.userId)
          applySnapshot(current)
          if (
            projectEvents([...current.events, ...batch]).conflicts >
            projectEvents(current.events).conflicts
          )
            throw new Error(
              'A pending ID conflicts with a saved record. Ask the manager to inspect it before retrying.',
            )
          const ids = new Set(current.events.map((event) => event.id))
          const remaining = batch.filter((event) => !ids.has(event.id))
          validateAssignedPayloads(
            remaining.map((event) => event.payload),
            current.students,
            current.events,
            current.enrollments,
            current.courses,
          )
          let snapshot = current
          if (remaining.length) {
            writeStarted = true
            snapshot = await postEvents(neon.userId, remaining)
          }
          applySnapshot(snapshot)
          localStorage.removeItem(key)
          return true
        })
        if (!saved) return false
      } else if (demo) {
        if (assignedDemo)
          validateAssignedPayloads(
            batch.map((event) => event.payload),
            roster,
            events,
          )
        setEvents((previous) => [...previous, ...batch])
      } else throw new Error('Sign in first.')
      setPending([])
      setMessage(
        `${batch.length} record${batch.length === 1 ? '' : 's'} saved${demo ? ' in this demo' : ''}.`,
      )
      return true
    } catch (cause) {
      setError(
        `${errorText(cause)}${writeStarted ? ' The save may already have reached the server. Retry the same pending batch to avoid counting it twice.' : ''}`,
      )
      return false
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  async function save(payloads: Payload[]): Promise<boolean> {
    if (storageBlocked || pending.length || !loaded || !payloads.length) return false
    try {
      return await send(
        payloads.map((payload) => makeEvent(neon?.teacher.name ?? 'Demo teacher', payload)),
      )
    } catch (cause) {
      setError(errorText(cause))
      return false
    }
  }
  async function discard() {
    if (
      !window.confirm(
        t(
          'Stop retrying this batch? It may already exist on the server. Refresh and check the saved records before entering it again.',
        ),
      )
    )
      return
    if (!navigator.locks) {
      setStorageBlocked(
        'This browser cannot safely coordinate saves between tabs. Use a current browser with Web Locks support.',
      )
      return
    }
    try {
      await withPendingLocks(key, () => {
        if (localStorage.getItem(key) !== JSON.stringify(pending))
          throw new Error('The pending batch changed in another tab. Reload before discarding.')
        localStorage.removeItem(key)
        setPending([])
        setError('')
      })
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  const scopedEvents = useMemo(
    () => (neonUserId || assignedDemo ? assignedEvents(events, roster) : events),
    [neonUserId, assignedDemo, events, roster],
  )
  return {
    events: scopedEvents,
    roster,
    courses,
    enrollments,
    snapshotTeacher,
    pending,
    storageBlocked,
    loaded,
    busy,
    error,
    message,
    invalid,
    refresh,
    save,
    retry: () => (storageBlocked ? Promise.resolve(false) : send(pending, true)),
    discard,
  }
}
function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : 'The request failed.'
}
