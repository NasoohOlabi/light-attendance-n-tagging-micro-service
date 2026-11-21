import { z } from 'zod'
import type { BotContext, Screen } from '../types'
import { back, home, page, pageSize, pagination, short, t, today, unavailable } from './shared'

export const insightRoutes = ['nb.followup', 'nb.chart'] as const
const courseIdSchema = z.union([z.uuid(), z.literal('previous')])
const overviewSchema = z.object({
  date: z.iso.date(),
  recentDates: z.array(z.iso.date()).max(6),
  sessionCounts: z.object({
    marked: z.number().int().nonnegative(),
    unmarked: z.number().int().nonnegative(),
  }),
  followUp: z.array(
    z.object({
      name: z.string(),
      absences: z.number().int().nonnegative(),
      marks: z.array(z.enum(['present', 'absent', 'excused', 'unmarked'])).max(6),
    }),
  ),
})
const chartSchema = z.object({
  summaryUrl: z.url(),
  chart: z.array(
    z.object({
      label: z.string(),
      rate: z.number().min(0).max(1).nullable(),
      evidence: z.string(),
    }),
  ),
})

export async function insightWorkflow(ctx: BotContext): Promise<Screen> {
  const courseId = courseIdSchema.safeParse(ctx.args.courseId)
  if (!courseId.success || !ctx.tools.has('get_course_attendance_view')) return unavailable(ctx)
  const route = insightRoutes.find((value) => value === ctx.route)
  if (!route) return unavailable(ctx)
  const L = (en: string, ar: string) => t(ctx, en, ar)
  const index = page(ctx.args.page)
  const date = z.iso.date().safeParse(ctx.args.date)
  const request = {
    courseId: courseId.data === 'previous' ? 'none' : courseId.data,
    date: date.success ? date.data : today(),
    language: ctx.lang,
  }
  const previous = { courseId: courseId.data }
  if (route === 'nb.followup') {
    const data = overviewSchema.parse(
      await ctx.call('get_course_attendance_view', { ...request, view: 'overview' }),
    )
    const dates = data.recentDates.join(' · ') || L('No recorded sessions.', 'لا توجد جلسات مسجلة.')
    const lines = data.followUp
      .slice(index * pageSize, (index + 1) * pageSize)
      .map(
        (row) =>
          `${short(row.name, 100)} · ${L('Absences', 'الغياب')}: ${row.absences}\n${row.marks.map((mark) => ({ present: '✓', absent: '✗', excused: '○', unmarked: '–' })[mark]).join(' ')}`,
      )
    return {
      text: `${L('Follow-up', 'المتابعة')} · ${data.date}\n${L('Marked', 'تم تسجيل')} ${data.sessionCounts.marked} · ${L('Unmarked', 'لم يسجل')} ${data.sessionCounts.unmarked}\n${L('Recent sessions', 'الجلسات الأخيرة')}: ${dates}\n${lines.length ? L('✓ Present · ✗ Absent · ○ Excused · – Unmarked', '✓ حاضر · ✗ غائب · ○ معذور · – لم يسجل') + '\n' : ''}${lines.join('\n') || L('No students need follow-up.', 'لا يوجد طلاب يحتاجون للمتابعة.')}`,
      rows: [
        ...pagination(ctx, route, { ...previous, date: request.date }, index, data.followUp.length),
        [back(ctx, 'nb.summary.course', previous), home(ctx)],
      ],
    }
  }
  const data = chartSchema.parse(
    await ctx.call('get_course_attendance_view', { ...request, view: 'chart' }),
  )
  const url = new URL(data.summaryUrl)
  const origin = new URL(ctx.website)
  if (
    url.origin !== origin.origin ||
    url.username ||
    url.password ||
    !['http:', 'https:'].includes(url.protocol)
  )
    throw new Error('Invalid summary URL')
  const lines = data.chart.slice(index * pageSize, (index + 1) * pageSize).map((row) => {
    const filled = row.rate === null ? 0 : Math.round(row.rate * 10)
    return `${short(row.label, 60)} · ${short(row.evidence, 80)}\n${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`
  })
  return {
    text: `${L('Attendance chart', 'مخطط الحضور')}\n${lines.join('\n') || L('No students to chart.', 'لا يوجد طلاب للمخطط.')}`,
    rows: [
      ...pagination(ctx, route, { ...previous, date: request.date }, index, data.chart.length),
      [{ label: L('Open chart and export', 'فتح المخطط والتصدير'), url: url.href }],
      [back(ctx, 'nb.summary.course', previous), home(ctx)],
    ],
  }
}
