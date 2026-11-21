import { z } from 'zod'
import { type NeonSnapshot } from '../../shared/neon'
import {
  normalizeStatus,
  normalizedNoteTags,
  payloadSchema,
  projectEvents,
} from '../../shared/ledger'
import type { BotContext, Screen } from '../types'
import {
  t,
  button,
  home,
  back,
  short,
  today,
  page,
  pagination,
  prompt,
  unavailable,
  event,
  fresh,
  pageSize,
} from './shared'

export const historyRoutes = [
  'nb.note.tags',
  'nb.note.text',
  'nb.note.save',
  'nb.history',
  'nb.history.item',
  'nb.reverse.reason',
  'nb.reverse.save',
] as const
export async function historyWorkflow(ctx: BotContext, snapshot: NeonSnapshot): Promise<Screen> {
  const { route, args } = ctx
  const L = (en: string, ar: string) => t(ctx, en, ar)
  const projection = projectEvents(snapshot.events)
  const student = snapshot.students.find((s) => s.studentId === args.studentId)
  const studentArgs = { studentId: args.studentId ?? '' }
  if (route === 'nb.note.tags' || route === 'nb.note.text' || route === 'nb.note.save') {
    if (!student || !ctx.tools.has('append_events')) return unavailable(ctx)
    if (route === 'nb.note.tags' || ctx.input === undefined)
      return prompt(
        ctx,
        L('Send tags separated by commas.', 'أرسل الوسوم مفصولة بفواصل.'),
        { route: 'nb.note.text', args: studentArgs },
        'nb.student',
        studentArgs,
      )
    if (route === 'nb.note.text') {
      const tags = normalizedNoteTags(ctx.input)
      if (tags.length > 20 || tags.some((tag) => tag.length > 60))
        return prompt(
          ctx,
          L(
            'Use at most 20 tags, each up to 60 characters.',
            'استخدم ٢٠ وسماً كحد أقصى، كل منها حتى ٦٠ حرفاً.',
          ),
          { route: 'nb.note.text', args: studentArgs },
          'nb.student',
          studentArgs,
        )
      return prompt(
        ctx,
        L('Send the note text.', 'أرسل نص الملاحظة.'),
        {
          route: 'nb.note.save',
          args: { ...studentArgs, tags: JSON.stringify(tags), date: today(), ...fresh() },
        },
        'nb.student',
        studentArgs,
      )
    }
    const tags = z
      .array(z.string().min(1).max(60))
      .min(1)
      .max(20)
      .parse(JSON.parse(args.tags ?? '[]'))
    const value = payloadSchema.safeParse({
      kind: 'note',
      studentId: student.studentId,
      date: args.date,
      tags,
      text: ctx.input,
    })
    if (!value.success)
      return prompt(
        ctx,
        L('Enter note text of 1–10000 characters.', 'أدخل ملاحظة من ١ إلى ١٠٠٠٠ حرف.'),
        { route, args },
        'nb.student',
        studentArgs,
      )
    await ctx.call('append_events', { events: [event(value.data, args)] })
    return {
      text: L('Note saved.', 'تم حفظ الملاحظة.'),
      rows: [[back(ctx, 'nb.student', studentArgs), home(ctx)]],
    }
  }
  if (route === 'nb.history') {
    if (!student) return unavailable(ctx)
    const list = projection.events
      .filter(
        (e) =>
          (e.payload.kind === 'attendance' || e.payload.kind === 'note') &&
          e.payload.studentId === student.studentId,
      )
      .reverse()
    const index = page(args.page)
    const rows = list.slice(index * pageSize, (index + 1) * pageSize).map((e) => {
      const value = e.payload
      const description =
        value.kind === 'attendance'
          ? `${value.date} · ${L(normalizeStatus(value.status), { present: 'حاضر', absent: 'غائب', excused: 'معذور' }[normalizeStatus(value.status)])}`
          : value.kind === 'note'
            ? `${value.date} · ${short(value.text, 70)}`
            : ''
      return [
        button(`${projection.reversed.has(e.id) ? '↩ ' : ''}${description}`, 'nb.history.item', {
          ...studentArgs,
          targetId: e.id,
        }),
      ]
    })
    return {
      text: `${L('History', 'السجل')} · ${short(student.name)}${list.length ? '' : `\n${L('No records.', 'لا توجد سجلات.')}`}`,
      rows: [
        ...rows,
        ...pagination(ctx, route, studentArgs, index, list.length),
        [back(ctx, 'nb.student', studentArgs), home(ctx)],
      ],
    }
  }
  if (route === 'nb.history.item' || route === 'nb.reverse.reason' || route === 'nb.reverse.save') {
    const target = projection.events.find(
      (e) =>
        e.id === args.targetId &&
        (e.payload.kind === 'attendance' || e.payload.kind === 'note') &&
        e.payload.studentId === student?.studentId,
    )
    if (!student || !target) return unavailable(ctx)
    const targetArgs = { ...studentArgs, targetId: target.id }
    if (route === 'nb.history.item') {
      const payload = target.payload
      const notePage = page(args.page)
      const details =
        payload.kind === 'note'
          ? `${payload.date}\n${payload.tags.map((tag) => `#${tag}`).join(' ')}\n${payload.text.slice(notePage * 2000, (notePage + 1) * 2000)}`
          : payload.kind === 'attendance'
            ? `${payload.date} · ${L(normalizeStatus(payload.status), { present: 'حاضر', absent: 'غائب', excused: 'معذور' }[normalizeStatus(payload.status)])}`
            : ''
      return {
        text: `${details}${projection.reversed.has(target.id) ? `\n${L('Corrected', 'تم التصحيح')}` : ''}`,
        rows: [
          ...(payload.kind === 'note' && notePage > 0
            ? [
                [
                  button(L('Previous', 'السابق'), route, {
                    ...targetArgs,
                    page: String(notePage - 1),
                  }),
                ],
              ]
            : []),
          ...(payload.kind === 'note' && (notePage + 1) * 2000 < payload.text.length
            ? [[button(L('Next', 'التالي'), route, { ...targetArgs, page: String(notePage + 1) })]]
            : []),
          ...(!projection.reversed.has(target.id) && ctx.tools.has('append_events')
            ? [[button(L('Correct', 'تصحيح'), 'nb.reverse.reason', targetArgs)]]
            : []),
          [back(ctx, 'nb.history', studentArgs), home(ctx)],
        ],
      }
    }
    if (!ctx.tools.has('append_events') || projection.reversed.has(target.id))
      return unavailable(ctx)
    if (route === 'nb.reverse.reason' && ctx.input === undefined)
      return prompt(
        ctx,
        L('Send the correction reason.', 'أرسل سبب التصحيح.'),
        { route, args: targetArgs },
        'nb.history.item',
        targetArgs,
      )
    if (route === 'nb.reverse.reason') {
      const reason = (ctx.input ?? '').trim()
      if (!reason || reason.length > 1000)
        return prompt(
          ctx,
          L('Enter a reason of 1–1000 characters.', 'أدخل سبباً من ١ إلى ١٠٠٠ حرف.'),
          { route, args: targetArgs },
          'nb.history.item',
          targetArgs,
        )
      return {
        text: `${L('Confirm correction?', 'تأكيد التصحيح؟')}\n${short(reason, 1000)}`,
        rows: [
          [
            button(L('Confirm', 'تأكيد'), 'nb.reverse.save', { ...targetArgs, reason, ...fresh() }),
            back(ctx, 'nb.history.item', targetArgs),
          ],
          [home(ctx)],
        ],
      }
    }
    if (route === 'nb.reverse.save') {
      await ctx.call('append_events', {
        events: [event({ kind: 'reversal', targetId: target.id, reason: args.reason }, args)],
      })
      return {
        text: L('Correction saved.', 'تم حفظ التصحيح.'),
        rows: [[back(ctx, 'nb.history', studentArgs), home(ctx)]],
      }
    }
  }
  return unavailable(ctx)
}
