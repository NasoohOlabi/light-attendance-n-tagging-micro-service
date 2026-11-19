import { courseWorkbook, type CourseExportInput } from '../shared/courseExport'

export * from '../shared/courseExport'

export async function downloadCourseWorkbook(input: CourseExportInput) {
  const blob = await courseWorkbook(input)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const name =
    input.course.name
      .replace(/[\\/:*?"<>|\p{Cc}]/gu, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 100) || 'course'
  const report = input.options?.report ?? 'full'
  link.download = `${name}${report === 'full' ? '' : `-${report}`}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
