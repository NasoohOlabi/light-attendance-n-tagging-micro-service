import { makeEvent } from '../shared/ledger'
import { today } from './queryState'

export function demoEvents() {
  const first = crypto.randomUUID()
  const second = crypto.randomUUID()
  return [
    makeEvent('Demo manager', { kind: 'student', studentId: first, name: 'أحمد', group: 'الحلقة الأولى', active: true }),
    makeEvent('Demo manager', { kind: 'student', studentId: second, name: 'Omar', group: 'الحلقة الأولى', active: true }),
    makeEvent('Demo teacher', { kind: 'attendance', studentId: first, date: today(), status: 'present' }),
    makeEvent('Demo teacher', { kind: 'note', studentId: first, date: today(), tags: ['revision', 'follow-up'], text: 'Review the last two pages together next session.' }),
  ]
}
