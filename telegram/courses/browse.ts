import { z } from 'zod'
import { courses } from '../courses'
import { numeric } from './numeric'
import { rankStudents } from '../../shared/studentSearch'
import type { CourseContext } from './context'
import type { Screen, Button } from '../types'

export async function browse(state: CourseContext): Promise<Screen> {
  const { ctx, t, b, back, denied, snapshot, admin, id, course, base, paginate, prompt, propose } =
    state
  if (ctx.route === 'co.list') {
    const query = ctx.args.q ?? ''
    const list = rankStudents(
      snapshot.courses.map((item) => ({ ...item, name: item.name })),
      query,
    )
    const rows = paginate(
      list,
      (item) =>
        b(`${item.name}${item.open ? '' : t(' (closed)', ' (مغلقة)')}`, 'co.view', { id: item.id }),
      'co.list',
      { q: query },
    )
    rows.push([b(t('Search', 'بحث'), 'co.search', { target: 'co.list' })])
    if (ctx.tools.has('save_course'))
      rows.push([b(t('Create course', 'إنشاء دورة'), 'co.name', { id: crypto.randomUUID() })])
    return { text: t('Courses', 'الدورات'), rows }
  }
  if (ctx.route === 'co.search') {
    const target = ctx.args.target === 'co.members' ? 'co.members' : 'co.list'
    if (ctx.input === undefined)
      return prompt(
        t('Send a name to search, or /cancel.', 'أرسل اسماً للبحث، أو /cancel للإلغاء.'),
        'co.search',
        ctx.args,
        target,
      )
    return courses({
      ...ctx,
      route: target,
      args: { ...base, q: ctx.input.trim() },
      input: undefined,
    })
  }
  if (ctx.route === 'co.name') {
    if (!ctx.tools.has('save_course')) return denied()
    if (ctx.input === undefined)
      return prompt(
        t('Send the course name, or /cancel.', 'أرسل اسم الدورة، أو /cancel للإلغاء.'),
        'co.name',
        ctx.args,
        course ? 'co.view' : 'co.list',
      )
    const name = ctx.input.trim()
    if (!name || name.length > 200)
      return prompt(
        t('Enter a name of 1–200 characters.', 'أدخل اسماً من ١ إلى ٢٠٠ حرف.'),
        'co.name',
        ctx.args,
        course ? 'co.view' : 'co.list',
      )
    return propose(
      'save_course',
      { id, name },
      'course',
      course ? 'co.view' : 'co.list',
      `${t('Course name', 'اسم الدورة')}: ${name}`,
    )
  }
  if (!course)
    return { text: t('Course not found.', 'الدورة غير موجودة.'), rows: [back('co.list')] }
  if (ctx.route === 'co.view') {
    const rows: Button[][] = [[b(t('Students', 'الطلاب'), 'co.members', base)]]
    if (admin) {
      rows.push([
        b(t('Readiness', 'جاهزية النتائج'), 'co.readiness', base),
        b(t('Reports', 'التقارير'), 'co.reports', base),
      ])
      if (ctx.tools.has('save_course')) rows.push([b(t('Rename', 'تعديل الاسم'), 'co.name', base)])
      if (ctx.tools.has('set_course_thresholds'))
        rows.push([b(t('Thresholds', 'حدود النجاح'), 'co.thresholds', base)])
      if (ctx.tools.has('set_course_status'))
        rows.push([
          b(
            course.open
              ? t('Close course', 'إغلاق الدورة')
              : t('Reopen course', 'إعادة فتح الدورة'),
            'co.status',
            base,
          ),
        ])
    }
    rows.push(back('co.list'))
    return {
      text: `${course.name}\n${course.open ? t('Open', 'مفتوحة') : t('Closed', 'مغلقة')}`,
      rows,
    }
  }
  if (ctx.route === 'co.status') {
    if (!ctx.tools.has('set_course_status')) return denied()
    return propose(
      'set_course_status',
      { id, open: !course.open },
      'course',
      'co.view',
      course.open
        ? t(
            'Closing may advance eligible students’ roster levels.',
            'قد يؤدي الإغلاق إلى ترقية مستويات الطلاب المستحقين.',
          )
        : t('Reopen this course?', 'إعادة فتح هذه الدورة؟'),
    )
  }
  if (ctx.route === 'co.thresholds' && ctx.tools.has('set_course_thresholds')) {
    return {
      text: `${t('Thresholds', 'حدود النجاح')}: ${course.attendanceMinimum} / ${course.practicalMinimum} / ${course.theoryMinimum}`,
      rows: [
        [
          b(t('Attendance', 'الحضور'), 'co.threshold', { id, field: 'attendanceMinimum' }),
          b(t('Practical', 'العملي'), 'co.threshold', { id, field: 'practicalMinimum' }),
        ],
        [b(t('Theory', 'النظري'), 'co.threshold', { id, field: 'theoryMinimum' })],
        back('co.view', base),
      ],
    }
  }
  if (ctx.route === 'co.threshold' && ctx.tools.has('set_course_thresholds')) {
    const field = z
      .enum(['attendanceMinimum', 'practicalMinimum', 'theoryMinimum'])
      .safeParse(ctx.args.field)
    if (!field.success) return denied()
    if (ctx.input === undefined)
      return prompt(
        t('Send a minimum from 0 to 100.', 'أرسل الحد من ٠ إلى ١٠٠.'),
        'co.threshold',
        ctx.args,
        'co.thresholds',
      )
    const value = numeric(ctx.input)
    if (value === null || value < 0 || value > 100)
      return prompt(
        t('Enter a number from 0 to 100.', 'أدخل رقماً من ٠ إلى ١٠٠.'),
        'co.threshold',
        ctx.args,
        'co.thresholds',
      )
    return propose(
      'set_course_thresholds',
      {
        id,
        attendanceMinimum: course.attendanceMinimum,
        practicalMinimum: course.practicalMinimum,
        theoryMinimum: course.theoryMinimum,
        [field.data]: value,
      },
      'course',
      'co.view',
      `${field.data}: ${value}`,
    )
  }
  return denied()
}
