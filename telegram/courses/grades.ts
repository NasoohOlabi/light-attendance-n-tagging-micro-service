import { numeric } from './numeric'
import { z } from 'zod'
import type { CourseContext } from './context'
import type { Screen } from '../types'

export async function grades(state: CourseContext): Promise<Screen> {
  const { ctx, t, b, back, denied, course, entry, prompt, propose } = state
  if (!course) return denied()
  if (ctx.route === 'co.grades' && entry && ctx.tools.has('save_grades')) {
    return {
      text: `${t('Scores and notes', 'الدرجات والملاحظات')}\n${t('Theory', 'النظري')}: ${entry.theory ?? '—'}\n${t('Practical', 'العملي')}: ${entry.practical ?? '—'}\n${t('Notes', 'الملاحظات')}: ${entry.notes.slice(0, 500) || '—'}`,
      rows: [
        [
          b(t('Theory', 'النظري'), 'co.grade', { ...ctx.args, field: 'theory' }),
          b(t('Practical', 'العملي'), 'co.grade', { ...ctx.args, field: 'practical' }),
        ],
        [b(t('Notes', 'الملاحظات'), 'co.grade', { ...ctx.args, field: 'notes' })],
        back('co.student', ctx.args),
      ],
    }
  }
  if (ctx.route === 'co.grade' && entry && ctx.tools.has('save_grades')) {
    const field = z.enum(['theory', 'practical', 'notes']).safeParse(ctx.args.field)
    if (!field.success) return denied()
    const message =
      field.data === 'notes'
        ? t('Send notes, or - to clear.', 'أرسل الملاحظات أو - للمسح.')
        : t('Send a score from 0 to 100, or - to clear.', 'أرسل درجة من ٠ إلى ١٠٠ أو - للمسح.')
    if (ctx.input === undefined) return prompt(message, 'co.grade', ctx.args, 'co.grades')
    const raw = ctx.input.trim()
    const value =
      field.data === 'notes' ? (raw === '-' ? '' : raw) : raw === '-' ? null : numeric(raw)
    if (
      !raw ||
      (field.data !== 'notes' &&
        raw !== '-' &&
        (typeof value !== 'number' || value < 0 || value > 100))
    )
      return prompt(message, 'co.grade', ctx.args, 'co.grades')
    return propose(
      'save_grades',
      {
        id: entry.id,
        theory: entry.theory,
        practical: entry.practical,
        notes: entry.notes,
        [field.data]: value,
      },
      'entry',
      'co.student',
      `${field.data}: ${String(value ?? '—').slice(0, 500)}`,
    )
  }
  if (ctx.route === 'co.decision' && entry && ctx.tools.has('save_grade_decision'))
    return {
      text: t('Choose a result, then give a reason.', 'اختر النتيجة ثم اذكر السبب.'),
      rows: [
        [
          b(t('Pass', 'ناجح'), 'co.reason', { ...ctx.args, result: 'pass' }),
          b(t('Fail', 'راسب'), 'co.reason', { ...ctx.args, result: 'fail' }),
        ],
        [
          b(t('Calculated result', 'النتيجة المحسوبة'), 'co.reason', {
            ...ctx.args,
            result: 'calculated',
          }),
        ],
        back('co.student', ctx.args),
      ],
    }
  if (ctx.route === 'co.reason' && entry && ctx.tools.has('save_grade_decision')) {
    const result = z.enum(['pass', 'fail', 'calculated']).safeParse(ctx.args.result)
    if (!result.success) return denied()
    if (ctx.input === undefined)
      return prompt(
        t('Send the reason for this decision.', 'أرسل سبب هذا القرار.'),
        'co.reason',
        ctx.args,
        'co.decision',
      )
    const note = ctx.input.trim()
    if (!note || note.length > 2000)
      return prompt(
        t('Enter a reason of 1–2000 characters.', 'أدخل سبباً من ١ إلى ٢٠٠٠ حرف.'),
        'co.reason',
        ctx.args,
        'co.decision',
      )
    return propose(
      'save_grade_decision',
      { id: entry.id, result: result.data, note, requestId: crypto.randomUUID() },
      'entry',
      'co.student',
      `${result.data}: ${note}`,
    )
  }
  return denied()
}
