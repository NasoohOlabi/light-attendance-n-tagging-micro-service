import { rankStudents } from '../../shared/studentSearch'
import type { CourseContext } from './context'
import type { Screen, Button } from '../types'

export async function members(state: CourseContext): Promise<Screen> {
  const {
    ctx,
    t,
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
    propose,
  } = state
  if (!course) return denied()
  if (ctx.route === 'co.members') {
    const query = ctx.args.q ?? ''
    const roster: { studentId: string; name: string; group: string; active: boolean }[] =
      board?.students ?? snapshot.students
    const list = rankStudents(
      admin
        ? roster
        : roster.filter((person) =>
            snapshot.enrollments.some(
              (item) => item.courseId === id && item.studentId === person.studentId,
            ),
          ),
      query,
    )
    const rows = paginate(
      list,
      (item) => {
        const e = snapshot.enrollments.find(
          (value) => value.courseId === id && value.studentId === item.studentId,
        )
        return b(`${item.name}${e?.active ? ' ✓' : ''}`, 'co.student', {
          id,
          student: item.studentId,
        })
      },
      'co.members',
      { id, q: query },
    )
    rows.push([b(t('Search students', 'بحث عن طالب'), 'co.search', { id, target: 'co.members' })])
    if (ctx.tools.has('create_student_in_course'))
      rows.push([b(t('Add new student', 'إضافة طالب جديد'), 'nb.add', { courseId: id })])
    rows.push(back('co.view', base))
    return { text: `${course.name} — ${t('Students', 'الطلاب')}`, rows }
  }
  const selected = snapshot.enrollments.find(
    (item) => item.courseId === id && item.studentId === ctx.args.student,
  )
  if (ctx.route === 'co.student') {
    const person = student ?? snapshot.students.find((item) => item.studentId === ctx.args.student)
    if (!person || (!admin && !selected)) return denied()
    const args = { id, student: person.studentId, ...(selected ? { entry: selected.id } : {}) }
    const rows: Button[][] = []
    if (ctx.tools.has('save_enrollment'))
      rows.push([
        b(
          selected?.active ? t('Withdraw', 'إلغاء التسجيل') : t('Enroll', 'تسجيل'),
          'co.membership',
          args,
        ),
      ])
    if (selected) {
      if (ctx.tools.has('save_enrollment'))
        rows.push([
          b(t('Level', 'المستوى'), 'co.level', args),
          b(t('Teacher', 'المعلم'), 'co.teacher', args),
        ])
      if (ctx.tools.has('set_handbook_received'))
        rows.push([
          b(
            selected.handbookReceived
              ? t('Mark handbook not received', 'إلغاء استلام الدليل')
              : t('Mark handbook received', 'تسجيل استلام الدليل'),
            'co.handbook',
            args,
          ),
        ])
      if (ctx.tools.has('save_grades'))
        rows.push([b(t('Scores and notes', 'الدرجات والملاحظات'), 'co.grades', args)])
      if (ctx.tools.has('save_grade_decision'))
        rows.push([b(t('Result decision', 'قرار النتيجة'), 'co.decision', args)])
    }
    rows.push(back('co.members', base))
    return {
      text: `${person.name}\n${t('Course level', 'مستوى الدورة')}: ${selected?.level || '—'}\n${t('Membership', 'التسجيل')}: ${selected?.active ? t('Active', 'نشط') : t('Not active', 'غير نشط')}${selected && admin ? `\n${t('Theory / practical', 'النظري / العملي')}: ${selected.theory ?? '—'} / ${selected.practical ?? '—'}\n${t('Notes', 'الملاحظات')}: ${selected.notes.slice(0, 500) || '—'}\n${t('Handbook', 'الدليل')}: ${selected.handbookReceived ? '✓' : '—'}` : ''}`,
      rows,
    }
  }
  if (ctx.route === 'co.membership' && student && ctx.tools.has('save_enrollment')) {
    return propose(
      'save_enrollment',
      {
        id: selected?.id ?? crypto.randomUUID(),
        courseId: id,
        studentId: student.studentId,
        level: selected?.level ?? student.group,
        active: !selected?.active,
        teacherId: selected?.teacherId ?? null,
      },
      selected ? 'entry' : 'new',
      'co.student',
      selected?.active
        ? t(
            'Withdraw membership? History and grades remain.',
            'إلغاء التسجيل؟ سيبقى التاريخ والدرجات.',
          )
        : t('Enroll this student?', 'تسجيل هذا الطالب؟'),
    )
  }
  if (ctx.route === 'co.level' && entry && ctx.tools.has('save_enrollment')) {
    if (ctx.input === undefined)
      return prompt(
        t('Send the course level. Send - to clear it.', 'أرسل مستوى الدورة. أرسل - لمسحه.'),
        'co.level',
        ctx.args,
        'co.student',
      )
    const level = ctx.input.trim() === '-' ? '' : ctx.input.trim()
    if (level.length > 200)
      return prompt(
        t('Level is too long.', 'المستوى طويل جداً.'),
        'co.level',
        ctx.args,
        'co.student',
      )
    return propose(
      'save_enrollment',
      {
        id: entry.id,
        courseId: id,
        studentId: entry.studentId,
        level,
        active: entry.active,
        teacherId: entry.teacherId,
      },
      'entry',
      'co.student',
      `${t('Level', 'المستوى')}: ${level || '—'}`,
    )
  }
  if (ctx.route === 'co.teacher' && entry && board && ctx.tools.has('save_enrollment')) {
    const rows = paginate(
      board.teachers.filter((teacher) => teacher.active),
      (teacher) => b(teacher.name, 'co.teacher.pick', { ...ctx.args, teacher: teacher.teacherId }),
      'co.teacher',
      ctx.args,
    )
    rows.push(
      [b(t('No teacher', 'بلا معلم'), 'co.teacher.pick', { ...ctx.args, teacher: '' })],
      back('co.student', ctx.args),
    )
    return { text: t('Choose the course teacher.', 'اختر معلم الدورة.'), rows }
  }
  if (ctx.route === 'co.teacher.pick' && entry && board && ctx.tools.has('save_enrollment')) {
    const teacher = ctx.args.teacher ?? ''
    if (teacher && !board.teachers.some((item) => item.teacherId === teacher && item.active))
      return denied()
    return propose(
      'save_enrollment',
      {
        id: entry.id,
        courseId: id,
        studentId: entry.studentId,
        level: entry.level,
        active: entry.active,
        teacherId: teacher || null,
      },
      'entry',
      'co.student',
      t('Change course teacher?', 'تغيير معلم الدورة؟'),
    )
  }
  if (ctx.route === 'co.handbook' && entry && ctx.tools.has('set_handbook_received'))
    return propose(
      'set_handbook_received',
      { id: entry.id, handbookReceived: !entry.handbookReceived },
      'entry',
      'co.student',
      t('Change handbook receipt?', 'تغيير حالة استلام الدليل؟'),
    )
  return denied()
}
