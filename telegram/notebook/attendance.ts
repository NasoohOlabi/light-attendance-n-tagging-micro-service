import {
  neonSnapshotSchema,
  neonStudentAttendanceSchema,
  type NeonSnapshot,
} from '../../shared/neon'
import { projectEvents, statusSchema } from '../../shared/ledger'
import { offlineAttendanceResponseSchema } from '../../shared/offlineAttendance'
import type { BotContext, Screen, Button } from '../types'
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
  dateSchema,
  pageSize,
} from './shared'

export const attendanceRoutes = [
  'nb.mine',
  'nb.attendance',
  'nb.summary',
  'nb.roll',
  'nb.date',
  'nb.mark',
  'nb.summary.course',
] as const
export async function mineWorkflow(ctx: BotContext): Promise<Screen> {
  const { route, args } = ctx
  const L = (en: string, ar: string) => t(ctx, en, ar)
  if (route === 'nb.mine') {
    if (!ctx.tools.has('get_my_attendance')) return unavailable(ctx)
    const data = neonStudentAttendanceSchema.parse(await ctx.call('get_my_attendance'))
    const index = page(args.page)
    const list = [...data.attendance].sort((a, b) => b.date.localeCompare(a.date))
    return {
      text: `${L('My attendance', 'حضوري')} — ${short(data.student.name)}\n${
        list
          .slice(index * pageSize, (index + 1) * pageSize)
          .map(
            (a) =>
              `${a.date} · ${short(a.course ?? L('Previous / no course', 'سابق / دون دورة'), 80)} · ${L(a.status, { present: 'حاضر', absent: 'غائب', excused: 'معذور' }[a.status])}`,
          )
          .join('\n') || L('No attendance recorded.', 'لا يوجد حضور مسجل.')
      }`,
      rows: [...pagination(ctx, route, {}, index, list.length), [home(ctx)]],
    }
  }
  return unavailable(ctx)
}

export async function attendanceWorkflow(ctx: BotContext, snapshot: NeonSnapshot): Promise<Screen> {
  const { route, args } = ctx
  const L = (en: string, ar: string) => t(ctx, en, ar)
  const projection = projectEvents(snapshot.events)
  const course = snapshot.courses.find((c) => c.id === args.courseId)
  const selectedDate = dateSchema.safeParse(args.date).success ? args.date : today()
  const courseArgs = { courseId: args.courseId ?? '', date: selectedDate }
  if (route === 'nb.attendance' || route === 'nb.summary') {
    const courses = snapshot.courses.filter((c) => route === 'nb.summary' || c.open)
    const index = page(args.page)
    return {
      text: `${route === 'nb.summary' ? L('Choose a course for summary.', 'اختر دورة للملخص.') : L('Choose a course for attendance.', 'اختر دورة للحضور.')}${courses.length ? '' : `\n${L('No courses available.', 'لا توجد دورات متاحة.')}`}`,
      rows: [
        ...(route === 'nb.summary' && index === 0
          ? [
              [
                button(L('Previous / no course', 'سابق / دون دورة'), 'nb.summary.course', {
                  courseId: 'previous',
                }),
              ],
            ]
          : []),
        ...courses.slice(index * pageSize, (index + 1) * pageSize).map((c) => [
          button(c.name, route === 'nb.summary' ? 'nb.summary.course' : 'nb.roll', {
            courseId: c.id,
            date: today(),
          }),
        ]),
        ...pagination(ctx, route, {}, index, courses.length),
        [home(ctx)],
      ],
    }
  }
  if (route === 'nb.roll' || route === 'nb.date' || route === 'nb.mark') {
    if (!course || !course.open) return unavailable(ctx)
    if (route === 'nb.date') {
      if (ctx.input === undefined)
        return prompt(
          ctx,
          L('Send date as YYYY-MM-DD.', 'أرسل التاريخ بالصيغة YYYY-MM-DD.'),
          { route: 'nb.date', args: courseArgs },
          'nb.roll',
          courseArgs,
        )
      if (!dateSchema.safeParse(ctx.input.trim()).success)
        return prompt(
          ctx,
          L('Invalid date. Send YYYY-MM-DD.', 'تاريخ غير صالح. أرسل YYYY-MM-DD.'),
          { route: 'nb.date', args: courseArgs },
          'nb.roll',
          courseArgs,
        )
      courseArgs.date = ctx.input.trim()
    }
    if (route === 'nb.mark') {
      if (!ctx.tools.has('sync_attendance')) return unavailable(ctx)
      const status = statusSchema.parse(args.status)
      const enrollment = snapshot.enrollments.find(
        (e) => e.id === args.enrollmentId && e.courseId === course.id && e.active,
      )
      if (
        !enrollment ||
        !snapshot.students.some((s) => s.studentId === enrollment.studentId && s.active)
      )
        return unavailable(ctx)
      const record = event(
        {
          kind: 'attendance',
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          date: selectedDate,
          status,
        },
        args,
      )
      const response = offlineAttendanceResponseSchema.parse(
        await ctx.call('sync_attendance', {
          records: [{ event: record, expectedEventId: args.expected || null }],
        }),
      )
      const outcome = response.outcomes.find((o) => o.id === record.id)
      if (!outcome || !['saved', 'unchanged'].includes(outcome.kind))
        return {
          text: L(
            'Attendance changed or could not be saved. Refresh and review before trying again.',
            'تغير الحضور أو تعذر حفظه. حدّث وراجع قبل المحاولة مجدداً.',
          ),
          rows: [[back(ctx, 'nb.roll', courseArgs), home(ctx)]],
        }
      const refreshed = await attendanceWorkflow(
        {
          ...ctx,
          route: 'nb.roll',
          args: { ...courseArgs, page: args.page ?? '0' },
          input: undefined,
        },
        neonSnapshotSchema.parse(await ctx.call('get_notebook')),
      )
      const name = snapshot.students.find((s) => s.studentId === enrollment.studentId)?.name ?? ''
      return {
        ...refreshed,
        text: `${L('Attendance saved', 'تم حفظ الحضور')}: ${short(name, 100)} · ${L(status, { present: 'حاضر', absent: 'غائب', excused: 'معذور' }[status])}\n${refreshed.text}`,
      }
    }
    const entries = snapshot.enrollments
      .filter((e) => e.courseId === course.id && e.active)
      .flatMap((e) => {
        const s = snapshot.students.find((item) => item.studentId === e.studentId && item.active)
        return s ? [{ enrollment: e, student: s }] : []
      })
    const index = page(args.page)
    const rows: Button[][] = []
    for (const { enrollment, student: s } of entries.slice(
      index * pageSize,
      (index + 1) * pageSize,
    )) {
      const current = projection.attendance.find(
        (a) => a.value.enrollmentId === enrollment.id && a.value.date === courseArgs.date,
      )
      rows.push([
        button(
          `${s.name} · ${current ? L(current.value.status, { present: 'حاضر', absent: 'غائب', excused: 'معذور' }[current.value.status]) : '—'}`,
          'nb.student',
          { studentId: s.studentId },
        ),
      ])
      if (ctx.tools.has('sync_attendance'))
        rows.push(
          (['present', 'absent', 'excused'] as const).map((status) =>
            button(
              L(
                { present: 'Present', absent: 'Absent', excused: 'Excused' }[status],
                { present: 'حاضر', absent: 'غائب', excused: 'معذور' }[status],
              ),
              'nb.mark',
              {
                ...courseArgs,
                enrollmentId: enrollment.id,
                status,
                expected: current?.event.id ?? '',
                page: String(index),
                ...fresh(),
              },
            ),
          ),
        )
    }
    rows.push(
      ...pagination(ctx, 'nb.roll', courseArgs, index, entries.length),
      [button(L('Change date', 'تغيير التاريخ'), 'nb.date', courseArgs)],
      [back(ctx, 'nb.attendance'), home(ctx)],
    )
    const marked = entries.filter(({ enrollment }) =>
      projection.attendance.some(
        (a) => a.value.enrollmentId === enrollment.id && a.value.date === courseArgs.date,
      ),
    ).length
    return {
      text: `${short(course.name)} · ${courseArgs.date}\n${L('Marked', 'تم تسجيل')} ${marked}/${entries.length}${entries.length ? '' : `\n${L('No active enrolled students.', 'لا يوجد طلاب مسجلون نشطون.')}`}`,
      rows,
    }
  }
  if (route === 'nb.summary.course') {
    const previous = args.courseId === 'previous'
    if (!course && !previous) return unavailable(ctx)
    const entries = previous
      ? snapshot.students.map((s) => ({ id: '', studentId: s.studentId }))
      : snapshot.enrollments.filter((e) => e.courseId === course?.id)
    const index = page(args.page)
    const lines = entries.slice(index * pageSize, (index + 1) * pageSize).map((e) => {
      const name = snapshot.students.find((s) => s.studentId === e.studentId)?.name ?? '—'
      const marks = projection.attendance.filter((a) =>
        previous
          ? a.value.studentId === e.studentId && !a.value.enrollmentId
          : a.value.enrollmentId === e.id,
      )
      return `${short(name, 100)}: ${L('Present', 'حاضر')} ${marks.filter((a) => a.value.status === 'present').length} · ${L('Absent', 'غائب')} ${marks.filter((a) => a.value.status === 'absent').length} · ${L('Excused', 'معذور')} ${marks.filter((a) => a.value.status === 'excused').length}`
    })
    return {
      text: `${course ? short(course.name) : L('Previous / no course', 'سابق / دون دورة')}\n${lines.join('\n') || L('No enrolled students.', 'لا يوجد طلاب مسجلون.')}`,
      rows: [
        ...pagination(ctx, route, { courseId: args.courseId }, index, entries.length),
        ...(ctx.tools.has('get_course_attendance_view')
          ? [
              [
                button(L('Follow-up', 'المتابعة'), 'nb.followup', { courseId: args.courseId }),
                button(L('Attendance chart', 'مخطط الحضور'), 'nb.chart', {
                  courseId: args.courseId,
                }),
              ],
            ]
          : []),
        [back(ctx, 'nb.summary'), home(ctx)],
      ],
    }
  }
  return unavailable(ctx)
}
