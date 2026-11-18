import { useEffect, useMemo, useRef, useState } from 'react'
import './courseExportDialog.css'
import {
  courseExportColumnLabels,
  courseExportColumns,
  courseExportDefaultColumns,
  courseExportRows,
  downloadCourseWorkbook,
  type CourseExportColumn,
  type CourseExportInput,
  type CourseExportOptions,
  type CourseExportReport,
} from './courseExport'

const reports: { value: CourseExportReport; en: string; ar: string }[] = [
  { value: 'full', en: 'Full workbook', ar: 'المصنف الكامل' },
  { value: 'grades', en: 'Grades', ar: 'الدرجات' },
  { value: 'students', en: 'Student details', ar: 'تفاصيل الطلاب' },
  { value: 'attendance', en: 'Daily attendance records', ar: 'سجلات الحضور اليومية' },
  { value: 'participants', en: 'Exam participants', ar: 'المشاركون في الامتحان' },
]

export function CourseExportDialog({
  onClose,
  ...input
}: CourseExportInput & { onClose: () => void }) {
  const { ar, entries, students, course, attendance } = input
  const dialog = useRef<HTMLDialogElement>(null)
  const [options, setOptions] = useState<CourseExportOptions>({ report: 'full' })
  const [columns, setColumns] = useState<CourseExportColumn[]>(courseExportDefaultColumns('full'))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const close = () => dialog.current?.close()
  const selected = { ...options, columns }
  const rows = useMemo(
    () => courseExportRows({ course, entries, students, attendance, ar, options }).length,
    [course, entries, students, attendance, ar, options],
  )
  const emptyFull =
    options.report === 'full' &&
    !entries.some((entry) => entry.courseId === course.id) &&
    !options.studentId &&
    options.level === undefined &&
    (!options.enrollment || options.enrollment === 'all') &&
    (!options.coverage || options.coverage === 'all') &&
    (!options.result || options.result === 'all')
  const canDownload = rows > 0 || emptyFull
  const invalidDates = !!options.from && !!options.to && options.from > options.to
  const courseEntries = entries.filter((entry) => entry.courseId === course.id)
  const levels = [...new Set(courseEntries.map((entry) => entry.level))].sort()
  const enrolledIds = new Set(courseEntries.map((entry) => entry.studentId))
  const courseStudents = students.filter((student) => enrolledIds.has(student.studentId))
  const update = (change: Partial<CourseExportOptions>) =>
    setOptions((current) => ({ ...current, ...change }))
  return (
    <dialog
      ref={dialog}
      className="grade-dialog course-export-dialog"
      aria-labelledby="course-export-title"
      dir={ar ? 'rtl' : 'ltr'}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault()
      }}
    >
      <h2 id="course-export-title" className="text-xl font-semibold">
        {ar ? 'تصدير Excel' : 'Export Excel'}
      </h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (pending || invalidDates || !columns.length || !canDownload) return
          setPending(true)
          setError(false)
          void downloadCourseWorkbook({ ...input, options: selected })
            .then(close)
            .catch(() => setError(true))
            .finally(() => setPending(false))
        }}
      >
        <label>
          {ar ? 'التقرير' : 'Report'}
          <select
            value={options.report}
            disabled={pending}
            onChange={(event) => {
              const report = reports.find((item) => item.value === event.target.value)?.value
              if (report) {
                setOptions({ report })
                setColumns(courseExportDefaultColumns(report))
              }
            }}
          >
            {reports.map((report) => (
              <option key={report.value} value={report.value}>
                {ar ? report.ar : report.en}
              </option>
            ))}
          </select>
        </label>
        {options.report === 'participants' && (
          <p>
            {ar
              ? 'المشارك لديه درجة محفوظة واحدة على الأقل، بما فيها الصفر. الدرجة الفارغة غير معروفة.'
              : 'A participant has at least one saved score, including zero. A blank score is unknown.'}
          </p>
        )}
        <details>
          <summary className="cursor-pointer py-2">
            {ar ? 'خيارات متقدمة' : 'Advanced options'}
          </summary>
          <div className="export-options">
            <fieldset className="export-columns">
              <legend>{ar ? 'الأعمدة' : 'Columns'}</legend>
              {courseExportColumns(options.report).map((column) => (
                <label key={column} className="export-column">
                  <input
                    type="checkbox"
                    checked={columns.includes(column)}
                    disabled={pending}
                    onChange={(event) =>
                      setColumns((current) =>
                        event.target.checked
                          ? courseExportColumns(options.report).filter(
                              (key) => key === column || current.includes(key),
                            )
                          : current.filter((item) => item !== column),
                      )
                    }
                  />
                  {courseExportColumnLabels[column][ar ? 1 : 0]}
                </label>
              ))}
              {!columns.length && (
                <p role="alert">
                  {ar ? 'اختر عموداً واحداً على الأقل.' : 'Select at least one column.'}
                </p>
              )}
            </fieldset>
            <label>
              {ar ? 'الطالب' : 'Student'}
              <select
                value={options.studentId ?? ''}
                disabled={pending}
                onChange={(event) => update({ studentId: event.target.value || undefined })}
              >
                <option value="">{ar ? 'كل الطلاب' : 'All students'}</option>
                {courseStudents.map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {ar ? 'التسجيل' : 'Enrollment'}
              <select
                value={options.enrollment ?? 'all'}
                disabled={pending}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'all' || value === 'active' || value === 'withdrawn')
                    update({ enrollment: value })
                }}
              >
                <option value="all">{ar ? 'الكل' : 'All'}</option>
                <option value="active">{ar ? 'مسجل' : 'Active'}</option>
                <option value="withdrawn">{ar ? 'منسحب' : 'Withdrawn'}</option>
              </select>
            </label>
            <label>
              {ar ? 'مستوى الدورة' : 'Course level'}
              <select
                value={options.level === undefined ? 'all' : `level:${options.level}`}
                disabled={pending}
                onChange={(event) =>
                  update({
                    level: event.target.value === 'all' ? undefined : event.target.value.slice(6),
                  })
                }
              >
                <option value="all">{ar ? 'كل المستويات' : 'All levels'}</option>
                {levels.map((level) => (
                  <option key={level} value={`level:${level}`}>
                    {level || (ar ? 'فارغ' : 'Blank')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {ar ? 'الدرجات المحفوظة' : 'Saved score coverage'}
              <select
                value={options.coverage ?? 'all'}
                disabled={pending}
                onChange={(event) => {
                  const value = event.target.value
                  if (
                    value === 'all' ||
                    value === 'any' ||
                    value === 'both' ||
                    value === 'theory' ||
                    value === 'practical' ||
                    value === 'none'
                  )
                    update({ coverage: value })
                }}
              >
                <option value="all">
                  {options.report === 'participants'
                    ? ar
                      ? 'درجة واحدة على الأقل'
                      : 'At least one score'
                    : ar
                      ? 'الكل'
                      : 'All'}
                </option>
                {options.report !== 'participants' && (
                  <option value="any">{ar ? 'درجة واحدة على الأقل' : 'At least one score'}</option>
                )}
                <option value="both">{ar ? 'النظري والعملي' : 'Both scores'}</option>
                <option value="theory">{ar ? 'النظري' : 'Theory'}</option>
                <option value="practical">{ar ? 'العملي' : 'Practical'}</option>
                {options.report !== 'participants' && (
                  <option value="none">{ar ? 'بلا درجات' : 'No scores'}</option>
                )}
              </select>
            </label>
            <label>
              {ar ? 'النتيجة المحفوظة' : 'Saved result'}
              <select
                value={options.result ?? 'all'}
                disabled={pending}
                onChange={(event) => {
                  const value = event.target.value
                  if (
                    value === 'all' ||
                    value === 'pass' ||
                    value === 'fail' ||
                    value === 'pending'
                  )
                    update({ result: value })
                }}
              >
                <option value="all">{ar ? 'الكل' : 'All'}</option>
                <option value="pass">{ar ? 'ناجح' : 'Pass'}</option>
                <option value="fail">{ar ? 'راسب' : 'Fail'}</option>
                <option value="pending">{ar ? 'قيد الانتظار' : 'Pending'}</option>
              </select>
            </label>
            {options.report === 'attendance' && (
              <>
                <label>
                  {ar ? 'من تاريخ' : 'From date'}
                  <input
                    type="date"
                    value={options.from ?? ''}
                    disabled={pending}
                    onChange={(event) => update({ from: event.target.value })}
                  />
                </label>
                <label>
                  {ar ? 'إلى تاريخ' : 'To date'}
                  <input
                    type="date"
                    value={options.to ?? ''}
                    disabled={pending}
                    onChange={(event) => update({ to: event.target.value })}
                  />
                </label>
                <label>
                  {ar ? 'حالة الحضور' : 'Attendance status'}
                  <select
                    value={options.mark ?? 'all'}
                    disabled={pending}
                    onChange={(event) => {
                      const value = event.target.value
                      if (
                        value === 'all' ||
                        value === 'present' ||
                        value === 'absent' ||
                        value === 'excused'
                      )
                        update({ mark: value })
                    }}
                  >
                    <option value="all">{ar ? 'الكل' : 'All'}</option>
                    <option value="present">{ar ? 'حاضر' : 'Present'}</option>
                    <option value="absent">{ar ? 'غائب' : 'Absent'}</option>
                    <option value="excused">{ar ? 'معذور' : 'Excused'}</option>
                  </select>
                </label>
                {invalidDates && (
                  <p role="alert">
                    {ar
                      ? 'يجب أن يسبق تاريخ البداية تاريخ النهاية.'
                      : 'From date must be on or before To date.'}
                  </p>
                )}
              </>
            )}
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => {
                setOptions({ report: options.report })
                setColumns(courseExportDefaultColumns(options.report))
              }}
            >
              {ar ? 'إعادة ضبط الخيارات' : 'Reset options'}
            </button>
          </div>
        </details>
        <p aria-live="polite">{ar ? `الصفوف المطابقة: ${rows}` : `Matching rows: ${rows}`}</p>
        {!rows && !emptyFull && (
          <p>
            {ar
              ? 'لا توجد صفوف مطابقة. غيّر المرشحات أو أعد ضبط الخيارات.'
              : 'No matching rows. Change the filters or reset options.'}
          </p>
        )}
        {error && (
          <p role="alert">
            {ar ? 'تعذر تصدير الملف. حاول مجدداً.' : 'Could not export file. Try again.'}
          </p>
        )}
        <div className="export-footer">
          <button
            type="submit"
            className="primary"
            disabled={pending || invalidDates || !columns.length || !canDownload}
          >
            {pending
              ? ar
                ? 'جارٍ التنزيل…'
                : 'Downloading…'
              : ar
                ? 'تنزيل Excel'
                : 'Download Excel'}
          </button>
          <button type="button" className="secondary" disabled={pending} onClick={close}>
            {ar ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
