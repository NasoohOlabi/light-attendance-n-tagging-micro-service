import { z } from 'zod'
import type { CourseContext } from './context'
import type { Screen } from '../types'

export async function commit(state: CourseContext): Promise<Screen> {
  const { ctx, t, back, denied, admin, current } = state
  if (ctx.route === 'co.commit') {
    const { tool, payload, kind, expected, returnRoute } = ctx.args
    const allowed = [
      'save_course',
      'set_course_status',
      'set_course_thresholds',
      'save_enrollment',
      'save_grades',
      'save_grade_decision',
      'set_handbook_received',
    ]
    if (
      !admin ||
      !tool ||
      !allowed.includes(tool) ||
      !payload ||
      !kind ||
      !expected ||
      !z.enum(['co.list', 'co.view', 'co.student']).safeParse(returnRoute).success ||
      !ctx.tools.has(tool)
    )
      return denied()
    const destination = z.enum(['co.list', 'co.view', 'co.student']).parse(returnRoute)
    if (JSON.stringify(current(kind)) !== expected)
      return {
        text: t(
          'The record changed. Reopen it and try again.',
          'تغير السجل. افتحه مجدداً وحاول مرة أخرى.',
        ),
        rows: [back(destination, ctx.args)],
      }
    const input = z.record(z.string(), z.unknown()).parse(JSON.parse(payload))
    await ctx.call(tool, { input })
    return {
      text: t('Saved successfully.', 'تم الحفظ بنجاح.'),
      rows: [back(destination, ctx.args)],
    }
  }
  return denied()
}
