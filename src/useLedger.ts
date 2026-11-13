import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { Access } from '../shared/access'
import { eventSchema, makeEvent, type LedgerEvent, type Payload } from '../shared/ledger'
import { appendEvents, readEvents } from './sheetdb'
import { demoEvents } from './demo'

export function useLedger(access: Access | null, demo: boolean) {
  const key = access ? `halaqa-pending-v1:${access.apiId}:${access.sheet}:${access.username}` : ''
  const [events, setEvents] = useState<LedgerEvent[]>(() => demo ? demoEvents() : [])
  const [pending, setPending] = useState<LedgerEvent[]>([])
  const [loaded, setLoaded] = useState(demo)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [invalid, setInvalid] = useState(0)
  useEffect(() => {
    if (!access) return
    try {
      const stored = localStorage.getItem(key)
      if (stored) setPending(z.array(eventSchema).parse(JSON.parse(stored)))
    } catch { setError('A saved pending batch could not be read. Keep a copy of browser storage before clearing it.') }
    let cancelled = false
    readEvents(access).then((result) => {
      if (!cancelled) { setEvents(result.events); setInvalid(result.invalid); setLoaded(true) }
    }).catch((cause: unknown) => { if (!cancelled) setError(errorText(cause)) })
    return () => { cancelled = true }
  }, [access, key])

  const refresh = useCallback(async () => {
    if (!access || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      const result = await readEvents(access)
      setEvents(result.events); setInvalid(result.invalid); setLoaded(true); setError('')
    } catch (cause) { setError(errorText(cause)) }
    finally { locked.current = false; setBusy(false) }
  }, [access])

  async function send(batch: LedgerEvent[]): Promise<boolean> {
    if (locked.current) return false
    locked.current = true
    setBusy(true); setError(''); setMessage('')
    try {
      if (access) {
        localStorage.setItem(key, JSON.stringify(batch))
        setPending(batch)
        const current = await readEvents(access)
        const ids = new Set(current.events.map((event) => event.id))
        const remaining = batch.filter((event) => !ids.has(event.id))
        await appendEvents(access, remaining)
        setEvents([...current.events, ...remaining])
        setInvalid(current.invalid)
        localStorage.removeItem(key)
      } else if (demo) setEvents((previous) => [...previous, ...batch])
      else throw new Error('Open your access link first.')
      setPending([])
      setMessage(`${batch.length} record${batch.length === 1 ? '' : 's'} saved${demo ? ' in this demo' : ''}.`)
      return true
    } catch (cause) {
      setError(`${errorText(cause)} The save may already have reached the sheet. Retry the same pending batch to avoid counting it twice.`)
      return false
    } finally { locked.current = false; setBusy(false) }
  }
  async function save(payloads: Payload[]): Promise<boolean> {
    if (pending.length || !loaded || !payloads.length) return false
    try { return await send(payloads.map((payload) => makeEvent(access?.username ?? 'Demo teacher', payload))) }
    catch (cause) { setError(errorText(cause)); return false }
  }
  function discard() {
    if (!window.confirm('Stop retrying this batch? It may already exist in the sheet. Refresh and inspect history before entering it again.')) return
    try { localStorage.removeItem(key); setPending([]); setError('') }
    catch { setError('Could not clear the pending batch in browser storage.') }
  }
  return { events, pending, loaded, busy, error, message, invalid, refresh, save, retry: () => send(pending), discard }
}
function errorText(cause: unknown) { return cause instanceof Error ? cause.message : 'The request failed.' }
