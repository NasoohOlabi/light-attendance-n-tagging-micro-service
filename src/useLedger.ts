import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { Access } from '../shared/access'
import {
  eventSchema,
  makeEvent,
  projectEvents,
  type LedgerEvent,
  type Payload,
} from '../shared/ledger'
import { appendEvents, readEvents, readRoster } from './sheetdb'
import { assignedEvents, assignedStudents, validateAssignedPayloads } from '../shared/roster'
import type { Student } from '../shared/ledger'
import { demoEvents } from './demo'
import { apiUrl, getNotebook, postEvents } from './neon'
import type { NeonTeacher } from '../shared/neon'

export function useLedger(
  access: Access | null,
  demo: boolean,
  assignedDemo = false,
  neon?: { userId: string; teacher: NeonTeacher },
) {
  const neonUserId = neon?.userId
  const key = neon
    ? `halaqa-pending-neon:${apiUrl}:${neon.teacher.id}`
    : access
      ? `halaqa-pending-v1:${access.apiId}:${access.sheet}:${access.username}${access.version === 2 ? `:${access.teacherId}:${access.roster.apiId}:${access.roster.sheet}` : ''}`
      : ''
  const [events, setEvents] = useState<LedgerEvent[]>(() => (demo ? demoEvents() : []))
  const [roster, setRoster] = useState<Student[]>(() =>
    assignedDemo ? projectEvents(events).students.slice(0, 1) : [],
  )
  const [pending, setPending] = useState<LedgerEvent[]>([])
  const [storageBlocked, setStorageBlocked] = useState(() =>
    (access || neon) && !navigator.locks
      ? 'This browser cannot safely coordinate saves between tabs. Use a current browser with Web Locks support.'
      : '',
  )
  const [loaded, setLoaded] = useState(demo)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [invalid, setInvalid] = useState(0)
  useEffect(() => {
    if (!access && !neonUserId) return
    try {
      const otherKey = Object.keys(localStorage).find(
        (item) =>
          (item.startsWith('halaqa-pending-v1:') || item.startsWith('halaqa-pending-neon:')) &&
          item !== key,
      )
      const stored = localStorage.getItem(key)
      // Restore the external pending batch when this access session mounts.
      // oxlint-disable-next-line react/set-state-in-effect
      if (stored) setPending(z.array(eventSchema).min(1).parse(JSON.parse(stored)))
      if (otherKey) {
        setStorageBlocked(
          'A pending batch belongs to another access link. Reopen that link and reconcile it before saving here.',
        )
      }
    } catch {
      setStorageBlocked(
        'Pending storage is unavailable or a saved batch is corrupted. Keep a copy of browser storage and ask the manager for help before saving.',
      )
    }
    let cancelled = false
    if (neonUserId) {
      getNotebook(neonUserId)
        .then((snapshot) => {
          if (!cancelled) {
            setEvents(snapshot.events)
            setRoster(snapshot.students)
            setLoaded(true)
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(errorText(cause))
        })
      return () => {
        cancelled = true
      }
    }
    if (!access) return
    Promise.all([
      readEvents(access),
      access.version === 2 ? readRoster(access.roster) : Promise.resolve([]),
    ])
      .then(([result, rows]) => {
        if (!cancelled) {
          setEvents(result.events)
          if (access.version === 2) setRoster(assignedStudents(rows, access.teacherId))
          setInvalid(result.invalid)
          setLoaded(true)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorText(cause))
      })
    return () => {
      cancelled = true
    }
  }, [access, key, neonUserId])

  const refresh = useCallback(async () => {
    if ((!access && !neonUserId) || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      if (neonUserId) {
        const snapshot = await getNotebook(neonUserId)
        setEvents(snapshot.events)
        setRoster(snapshot.students)
        setLoaded(true)
        setError('')
        return
      }
      if (!access) return
      const [result, rows] = await Promise.all([
        readEvents(access),
        access.version === 2 ? readRoster(access.roster) : Promise.resolve([]),
      ])
      if (access.version === 2) setRoster(assignedStudents(rows, access.teacherId))
      setEvents(result.events)
      setInvalid(result.invalid)
      setLoaded(true)
      setError('')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }, [access, neonUserId])

  async function send(batch: LedgerEvent[]): Promise<boolean> {
    if (locked.current || !batch.length) return false
    locked.current = true
    setBusy(true)
    setError('')
    setMessage('')
    let writeStarted = false
    try {
      if (access || neon) {
        if (!navigator.locks) {
          setStorageBlocked(
            'This browser cannot safely coordinate saves between tabs. Use a current browser with Web Locks support.',
          )
          return false
        }
        const saved = await navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
          if (!lock)
            throw new Error(
              'Another tab is saving this access link. Wait for it to finish, then refresh and try again. No write was sent from this tab.',
            )
          try {
            const existing = localStorage.getItem(key)
            if (existing && existing !== JSON.stringify(batch)) {
              const reason =
                'Another pending batch exists for this link. Reload and reconcile it before saving.'
              setStorageBlocked(reason)
              throw new Error(reason)
            }
            localStorage.setItem(key, JSON.stringify(batch))
          } catch (cause) {
            if (cause instanceof Error && cause.message.startsWith('Another pending')) throw cause
            const reason =
              'Could not persist the pending batch. No write was sent; restore browser storage before saving.'
            setStorageBlocked(reason)
            throw new Error(reason)
          }
          setPending(batch)
          if (neon) {
            if (!neon.teacher.canWrite) throw new Error('Your account has read-only access.')
            const current = await getNotebook(neon.userId)
            setRoster(current.students)
            validateAssignedPayloads(
              batch.map((event) => event.payload),
              current.students,
              current.events,
            )
            if (
              projectEvents([...current.events, ...batch]).conflicts >
              projectEvents(current.events).conflicts
            )
              throw new Error(
                'A pending ID conflicts with a saved record. Ask the manager to inspect it before retrying.',
              )
            const ids = new Set(current.events.map((event) => event.id))
            const remaining = batch.filter((event) => !ids.has(event.id))
            const snapshot = remaining.length
              ? ((writeStarted = true), await postEvents(neon.userId, remaining))
              : current
            setEvents(snapshot.events)
            setRoster(snapshot.students)
            localStorage.removeItem(key)
            return true
          }
          if (!access) return false
          const [current, rows] = await Promise.all([
            readEvents(access),
            access.version === 2 ? readRoster(access.roster) : Promise.resolve([]),
          ])
          if (access.version === 2) {
            const currentRoster = assignedStudents(rows, access.teacherId)
            setRoster(currentRoster)
            validateAssignedPayloads(
              batch.map((event) => event.payload),
              currentRoster,
              current.events,
            )
          }
          if (
            projectEvents([...current.events, ...batch]).conflicts >
            projectEvents(current.events).conflicts
          )
            throw new Error(
              'A pending ID conflicts with a sheet record. Ask the manager to inspect it before retrying.',
            )
          const ids = new Set(current.events.map((event) => event.id))
          const remaining = batch.filter((event) => !ids.has(event.id))
          if (remaining.length) writeStarted = true
          await appendEvents(access, remaining)
          setEvents([...current.events, ...remaining])
          setInvalid(current.invalid)
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
      } else throw new Error('Open your access link first.')
      setPending([])
      setMessage(
        `${batch.length} record${batch.length === 1 ? '' : 's'} saved${demo ? ' in this demo' : ''}.`,
      )
      return true
    } catch (cause) {
      setError(
        `${errorText(cause)}${writeStarted ? ' The save may already have reached the sheet. Retry the same pending batch to avoid counting it twice.' : ''}`,
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
        payloads.map((payload) =>
          makeEvent(neon?.teacher.name ?? access?.username ?? 'Demo teacher', payload),
        ),
      )
    } catch (cause) {
      setError(errorText(cause))
      return false
    }
  }
  async function discard() {
    if (
      !window.confirm(
        'Stop retrying this batch? It may already exist in the sheet. Refresh and inspect history before entering it again.',
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
      await navigator.locks.request(key, { ifAvailable: true }, (lock) => {
        if (!lock)
          throw new Error(
            'Another tab is saving this access link. Wait for it to finish before discarding.',
          )
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

  return {
    events: neon || access?.version === 2 || assignedDemo ? assignedEvents(events, roster) : events,
    roster,
    pending,
    storageBlocked,
    loaded,
    busy,
    error,
    message,
    invalid,
    refresh,
    save,
    retry: () => send(pending),
    discard,
  }
}
function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : 'The request failed.'
}
