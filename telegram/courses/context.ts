import { neonAdminBoardSchema, neonSnapshotSchema } from '../../shared/neon'
import type { BotContext, Screen, Action, Button } from '../types'

export async function courseContext(ctx: BotContext, needsBoard: boolean) {
  const t = (en: string, ar: string) => (ctx.lang === 'ar' ? ar : en)
  const a = (route: Action['route'], args: Record<string, string> = {}): Action => ({ route, args })
  const b = (label: string, route: Action['route'], args: Record<string, string> = {}): Button => ({
    label,
    action: a(route, args),
  })
  const back = (route: Action['route'], args: Record<string, string> = {}) => [
    b(t('← Back', '→ رجوع'), route, args),
  ]
  const denied = (): Screen => ({
    text: t('This action is unavailable for your account.', 'هذا الإجراء غير متاح لحسابك.'),
    rows: [back('co.list')],
  })
  const snapshot = neonSnapshotSchema.parse(await ctx.call('get_notebook'))
  const admin = ctx.tools.has('get_admin_board')
  const board =
    admin && needsBoard ? neonAdminBoardSchema.parse(await ctx.call('get_admin_board')) : null
  const id = ctx.args.id ?? ''
  const course = snapshot.courses.find((item) => item.id === id)
  const entry = snapshot.enrollments.find((item) => item.id === ctx.args.entry)
  const student =
    board?.students.find((item) => item.studentId === ctx.args.student) ??
    snapshot.students.find((item) => item.studentId === ctx.args.student)
  const base = { id }
  const page = Math.max(0, Number.parseInt(ctx.args.page ?? '0', 10) || 0)
  const paginate = <T>(
    items: T[],
    make: (item: T) => Button,
    route: Action['route'],
    args: Record<string, string>,
  ): Button[][] => {
    const rows = items.slice(page * 8, page * 8 + 8).map((item) => [make(item)])
    const nav: Button[] = []
    if (page > 0) nav.push(b('‹', route, { ...args, page: String(page - 1) }))
    if ((page + 1) * 8 < items.length) nav.push(b('›', route, { ...args, page: String(page + 1) }))
    if (nav.length) rows.push(nav)
    return rows
  }
  const prompt = (
    text: string,
    route: Action['route'],
    args: Record<string, string>,
    cancel: Action['route'],
  ): Screen => ({ text, rows: [back(cancel, args)], prompt: a(route, args) })
  const current = (kind: string) =>
    kind === 'course'
      ? (course ?? null)
      : kind === 'entry'
        ? entry
        : kind === 'new'
          ? (snapshot.enrollments.find(
              (item) => item.courseId === id && item.studentId === ctx.args.student,
            ) ?? null)
          : null
  const propose = (
    tool: string,
    input: Record<string, unknown>,
    kind: string,
    returnRoute: Action['route'],
    label: string,
  ): Screen => ({
    text: `${course?.name ?? ''}${student ? ` - ${student.name}` : ''}\n${label}\n\n${t('Confirm this change?', 'تأكيد هذا التغيير؟')}`,
    rows: [
      [
        b(t('Confirm', 'تأكيد'), 'co.commit', {
          ...ctx.args,
          tool,
          payload: JSON.stringify(input),
          kind,
          expected: JSON.stringify(current(kind)),
          returnRoute,
        }),
      ],
      back(returnRoute, ctx.args),
    ],
  })
  return {
    ctx,
    t,
    a,
    b,
    back,
    denied,
    snapshot,
    admin,
    board,
    id,
    course,
    entry,
    student,
    base,
    paginate,
    prompt,
    current,
    propose,
  }
}

export type CourseContext = Awaited<ReturnType<typeof courseContext>>
