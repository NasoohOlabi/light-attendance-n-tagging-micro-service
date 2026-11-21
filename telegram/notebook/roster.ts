import { z } from 'zod'
import {
  neonAdminStudentSchema,
  teacherStudentUpdateSchema,
  type NeonSnapshot,
} from '../../shared/neon'
import { rankStudents } from '../../shared/studentSearch'
import type { BotContext, Screen, Button } from '../types'
import {
  t,
  button,
  home,
  back,
  short,
  page,
  pagination,
  prompt,
  unavailable,
  idSchema,
  pageSize,
} from './shared'

export const rosterRoutes = [
  'nb.students',
  'nb.search',
  'nb.add',
  'nb.add.save',
  'nb.add.level',
  'nb.student',
  'nb.edit',
  'nb.phone',
  'nb.phone.save',
] as const
export async function rosterWorkflow(ctx: BotContext, snapshot: NeonSnapshot): Promise<Screen> {
  const { route, args } = ctx
  const L = (en: string, ar: string) => t(ctx, en, ar)
  const student = snapshot.students.find((s) => s.studentId === args.studentId)
  const course = snapshot.courses.find((c) => c.id === args.courseId)
  const studentArgs = { studentId: args.studentId ?? '' }
  if (route === 'nb.students' || route === 'nb.search') {
    if (route === 'nb.search' && ctx.input === undefined)
      return prompt(
        ctx,
        L('Send a student name to search.', 'أرسل اسم الطالب للبحث.'),
        { route: 'nb.search' },
        'nb.students',
      )
    const query = (ctx.input ?? args.query ?? '').trim().slice(0, 200)
    const list = rankStudents(snapshot.students, query)
    const index = page(args.page)
    const rows = list
      .slice(index * pageSize, (index + 1) * pageSize)
      .map((s) => [button(s.name, 'nb.student', { studentId: s.studentId })])
    rows.push(...pagination(ctx, 'nb.students', { query }, index, list.length))
    rows.push(
      [
        button(L('Search', 'بحث'), 'nb.search'),
        ...(ctx.tools.has('save_student')
          ? [button(L('Add student', 'إضافة طالب'), 'nb.add')]
          : []),
      ],
      [home(ctx)],
    )
    return {
      text: `${L('Students', 'الطلاب')} (${list.length})${query ? `\n${L('Search', 'بحث')}: ${short(query)}` : ''}${list.length ? '' : `\n${L('No students found.', 'لا يوجد طلاب.')}`}`,
      rows,
    }
  }
  if (route === 'nb.add' || route === 'nb.add.save' || route === 'nb.add.level') {
    const inCourse = Boolean(args.courseId)
    const backRoute = inCourse ? 'co.members' : 'nb.students'
    const backArgs: Record<string, string> = inCourse ? { id: args.courseId } : {}
    if (!ctx.tools.has(inCourse ? 'create_student_in_course' : 'save_student'))
      return unavailable(ctx)
    if (inCourse && !course) return unavailable(ctx)
    if (route === 'nb.add' || ctx.input === undefined)
      return prompt(
        ctx,
        L('Send the student name.', 'أرسل اسم الطالب.'),
        {
          route: 'nb.add.save',
          args: { ...args, studentId: crypto.randomUUID(), enrollmentId: crypto.randomUUID() },
        },
        backRoute,
        backArgs,
      )
    const parsed = neonAdminStudentSchema.safeParse({
      studentId: args.studentId,
      name: route === 'nb.add.level' ? args.name : ctx.input,
      teacherId: null,
      group: '',
      active: true,
    })
    if (!parsed.success)
      return prompt(
        ctx,
        L('Enter a name of 1–200 characters.', 'أدخل اسماً من ١ إلى ٢٠٠ حرف.'),
        { route: 'nb.add.save', args },
        backRoute,
        backArgs,
      )
    if (inCourse && route === 'nb.add.save')
      return prompt(
        ctx,
        L('Send the course level, or - for blank.', 'أرسل مستوى الدورة، أو - لتركه فارغاً.'),
        { route: 'nb.add.level', args: { ...args, name: ctx.input.trim() } },
        backRoute,
        backArgs,
      )
    if (inCourse) {
      const level = ctx.input.trim() === '-' ? '' : ctx.input.trim()
      if (level.length > 200)
        return prompt(
          ctx,
          L('Level must be at most 200 characters.', 'المستوى حتى ٢٠٠ حرف.'),
          { route, args },
          backRoute,
          backArgs,
        )
      await ctx.call('create_student_in_course', {
        input: {
          student: parsed.data,
          enrollment: {
            id: idSchema.parse(args.enrollmentId),
            courseId: idSchema.parse(args.courseId),
            level,
          },
        },
      })
    } else await ctx.call('save_student', { input: parsed.data })
    return {
      text: L('Student saved.', 'تم حفظ الطالب.'),
      rows: [[back(ctx, backRoute, backArgs), home(ctx)]],
    }
  }
  if (route === 'nb.student') {
    if (!student) return unavailable(ctx)
    const rows: Button[][] = []
    if (ctx.tools.has('update_student'))
      rows.push([button(L('Edit student', 'تعديل الطالب'), 'nb.edit', studentArgs)])
    if (ctx.tools.has('append_events'))
      rows.push([button(L('Add note', 'إضافة ملاحظة'), 'nb.note.tags', studentArgs)])
    rows.push(
      [button(L('History', 'السجل'), 'nb.history', studentArgs)],
      [back(ctx, 'nb.students'), home(ctx)],
    )
    return {
      text: `${short(student.name)}\n${L('Level', 'المستوى')}: ${short(student.group) || '—'}\n${L('Phone', 'الهاتف')}: ${short(student.whatsapp ?? '') || '—'}\n${student.active ? L('Active', 'نشط') : L('Inactive', 'غير نشط')}`,
      rows,
    }
  }
  if (route === 'nb.edit') {
    if (!student || !ctx.tools.has('update_student')) return unavailable(ctx)
    const fields = [
      ['firstName', L('First name', 'الاسم الأول')],
      ['lastName', L('Last name', 'اسم العائلة')],
      ['group', L('Level', 'المستوى')],
      ['whatsapp', L('Phone', 'الهاتف')],
      ['location', L('Location', 'الموقع')],
      ['birthYear', L('Birth year', 'سنة الميلاد')],
    ]
    return {
      text: L('Choose a field to edit.', 'اختر حقلاً للتعديل.'),
      rows: [
        ...fields.map(([field, label]) => [button(label, 'nb.phone', { ...studentArgs, field })]),
        [back(ctx, 'nb.student', studentArgs), home(ctx)],
      ],
    }
  }
  if (route === 'nb.phone' || route === 'nb.phone.save') {
    if (!student || !ctx.tools.has('update_student')) return unavailable(ctx)
    const expected = {
      firstName: student.firstName ?? student.name,
      lastName: student.lastName ?? '',
      group: student.group,
      whatsapp: student.whatsapp ?? null,
      location: student.location ?? null,
      birthYear: student.birthYear ?? null,
    }
    if (route === 'nb.phone' || ctx.input === undefined)
      return prompt(
        ctx,
        L(
          'Send the new value, or - to clear an optional field.',
          'أرسل القيمة الجديدة، أو - لمسح حقل اختياري.',
        ),
        {
          route: 'nb.phone.save',
          args: {
            ...studentArgs,
            field: args.field ?? 'whatsapp',
            expected: JSON.stringify(expected),
          },
        },
        'nb.student',
        studentArgs,
      )
    const previous = z
      .object({
        firstName: z.string(),
        lastName: z.string(),
        group: z.string(),
        whatsapp: z.string().nullable(),
        location: z.string().nullable(),
        birthYear: z.number().nullable(),
      })
      .safeParse(JSON.parse(args.expected ?? '{}'))
    if (!previous.success) return unavailable(ctx)
    const field = z
      .enum(['firstName', 'lastName', 'group', 'whatsapp', 'location', 'birthYear'])
      .safeParse(args.field)
    if (!field.success) return unavailable(ctx)
    const raw = ctx.input.trim()
    const next =
      field.data === 'birthYear'
        ? raw === '-'
          ? null
          : Number(raw)
        : raw === '-'
          ? field.data === 'whatsapp' || field.data === 'location'
            ? null
            : ''
          : raw
    const value = teacherStudentUpdateSchema.safeParse({
      studentId: student.studentId,
      ...previous.data,
      expected: previous.data,
      [field.data]: next,
    })
    if (!value.success)
      return prompt(
        ctx,
        L('Invalid value; try again.', 'القيمة غير صالحة؛ حاول مجدداً.'),
        { route, args },
        'nb.student',
        studentArgs,
      )
    await ctx.call('update_student', value.data)
    return {
      text: L('Student updated.', 'تم تحديث الطالب.'),
      rows: [[back(ctx, 'nb.student', studentArgs), home(ctx)]],
    }
  }
  return unavailable(ctx)
}
