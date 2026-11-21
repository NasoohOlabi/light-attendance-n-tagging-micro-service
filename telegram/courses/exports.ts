import { projectEvents } from '../../shared/ledger'
import { courseReadiness } from '../../shared/courseReadiness'
import { z } from 'zod'
import type { CourseContext } from './context'
import type { Screen } from '../types'

const reports = ['full', 'grades', 'students', 'attendance', 'participants'] as const

export async function exports(state: CourseContext): Promise<Screen> {
  const { ctx, t, b, back, denied, snapshot, admin, id, course, base } = state
  if (!course) return denied()
  if (ctx.route === 'co.readiness' && admin) {
    const readiness = courseReadiness({
      course,
      enrollments: snapshot.enrollments,
      students: snapshot.students,
      attendance: projectEvents(snapshot.events).attendance,
    })
    return {
      text: `${t('Result readiness', 'جاهزية النتائج')} — ${course.name}\n${t('Active students', 'الطلاب النشطون')}: ${readiness.total}\n${t('Missing theory / practical / attendance', 'النظري / العملي / الحضور الناقص')}: ${readiness.theory.length} / ${readiness.practical.length} / ${readiness.attendance.length}\n${t('Below theory / practical minimum', 'دون حد النظري / العملي')}: ${readiness.lowTheory.length} / ${readiness.lowPractical.length}`,
      rows: [back('co.view', base)],
    }
  }
  if (ctx.route === 'co.reports' && ctx.tools.has('export_course_report'))
    return {
      text: t('Choose an Excel report.', 'اختر تقرير Excel.'),
      rows: [
        ...reports.map((report) => [
          b(
            {
              full: t('Full report', 'التقرير الكامل'),
              grades: t('Grades', 'الدرجات'),
              students: t('Students', 'الطلاب'),
              attendance: t('Daily attendance', 'الحضور اليومي'),
              participants: t('Exam participants', 'المشاركون بالامتحان'),
            }[report],
            'co.report',
            { id, report },
          ),
        ]),
        back('co.view', base),
      ],
    }
  if (ctx.route === 'co.report' && ctx.tools.has('export_course_report')) {
    const report = z.enum(reports).safeParse(ctx.args.report)
    if (!report.success) return denied()
    const result = z.object({ blob: z.string() }).parse(
      await ctx.call('export_course_report', {
        courseId: id,
        report: report.data,
        format: 'xlsx',
        language: ctx.lang,
      }),
    )
    return {
      text: t('Your report is ready.', 'التقرير جاهز.'),
      rows: [back('co.reports', base)],
      document: {
        name: `${report.data}.xlsx`,
        bytes: Uint8Array.from(atob(result.blob), (char) => char.charCodeAt(0)),
      },
    }
  }
  return denied()
}
