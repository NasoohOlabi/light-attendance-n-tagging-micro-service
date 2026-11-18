import { useMemo, useState } from 'react'
import { ChartNoAxesColumn, Download, Share2 } from 'lucide-react'
import type { projectEvents, Student } from '../shared/ledger'
import {
  attendanceChartRows,
  drawAttendanceChart,
  labelChartRows,
  studentsPerChart,
} from './attendanceChart'
import { useLanguage } from './useLanguage'

type ChartSource = {
  students: Student[]
  attendance: ReturnType<typeof projectEvents>['attendance']
  scope: string
}

export function AttendanceChartExport(source: ChartSource) {
  const { language } = useLanguage()
  const [open, setOpen] = useState(false)
  const ar = language === 'ar'
  return (
    <div className="mb-5">
      <button
        type="button"
        className="secondary inline-flex items-center gap-2"
        aria-expanded={open && !!source.attendance.length}
        disabled={!source.attendance.length}
        onClick={() => setOpen(!open)}
      >
        <ChartNoAxesColumn size={18} aria-hidden="true" />
        {open ? (ar ? 'إغلاق' : 'Close') : ar ? 'تصدير مخطط الحضور' : 'Export attendance chart'}
      </button>
      {open && source.attendance.length > 0 && <ChartPreview {...source} />}
    </div>
  )
}

function ChartPreview({ students, attendance, scope }: ChartSource) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const [showNames, setShowNames] = useState(false)
  const [highlight, setHighlight] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<'share' | 'zip' | null>(null)
  const [packing, setPacking] = useState(false)
  const ranked = useMemo(() => attendanceChartRows(students, attendance), [students, attendance])
  const rows = useMemo(
    () => labelChartRows(ranked, language, showNames, highlight),
    [ranked, language, showNames, highlight],
  )
  const pages = Math.ceil(rows.length / studentsPerChart)
  const currentPage = Math.min(page, pages)
  const pageRows = (n: number) => rows.slice((n - 1) * studentsPerChart, n * studentsPerChart)
  const preview = useMemo(() => {
    try {
      const visible = rows.slice(
        (currentPage - 1) * studentsPerChart,
        currentPage * studentsPerChart,
      )
      const url = drawAttendanceChart({
        rows: visible,
        scope,
        page: currentPage,
        pages,
        language,
      }).toDataURL('image/png')
      const filename = `attendance-${currentPage}-of-${pages}.png`
      let file: File | null = null
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
        const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (char) =>
          char.charCodeAt(0),
        )
        const png = new File([bytes], filename, { type: 'image/png' })
        if (navigator.canShare({ files: [png] })) file = png
      }
      return { url, filename, file }
    } catch {
      return null
    }
  }, [rows, currentPage, pages, scope, language])
  const share = async () => {
    if (!preview?.file) return
    setError(null)
    try {
      await navigator.share({ files: [preview.file] })
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError('share')
    }
  }
  const downloadAll = async () => {
    setPacking(true)
    setError(null)
    try {
      const { downloadAttendancePages } = await import('./downloadAttendancePages')
      await downloadAttendancePages(pages, (n) =>
        drawAttendanceChart({ rows: pageRows(n), scope, page: n, pages, language }),
      )
    } catch {
      setError('zip')
    } finally {
      setPacking(false)
    }
  }
  return (
    <section
      className="mt-3 min-w-0 space-y-4 rounded-xl border border-slate-200 p-3 sm:p-5"
      aria-labelledby="attendance-chart-title"
    >
      <h3 id="attendance-chart-title" className="text-lg font-bold">
        {ar ? 'معاينة مخطط الحضور' : 'Attendance chart preview'}
      </h3>
      <label className="block">
        {ar ? 'تمييز طالب باسمه' : 'Highlight one student by name'}
        <select
          className="block w-full min-w-0"
          value={highlight}
          onChange={(event) => {
            const id = event.target.value
            setHighlight(id)
            const index = rows.findIndex((row) => row.id === id)
            if (index >= 0) setPage(Math.floor(index / studentsPerChart) + 1)
          }}
        >
          <option value="">{ar ? 'لا أحد' : 'None'}</option>
          {students.map((student) => (
            <option key={student.studentId} value={student.studentId}>
              {student.name}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={showNames}
          onChange={(event) => setShowNames(event.target.checked)}
        />
        {ar ? 'إظهار جميع الأسماء' : 'Show all names'}
      </label>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="secondary"
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            {ar ? 'السابق' : 'Previous'}
          </button>
          <span aria-live="polite">
            {ar ? `صفحة ${currentPage} من ${pages}` : `Page ${currentPage} of ${pages}`}
          </span>
          <button
            className="secondary"
            type="button"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            {ar ? 'التالي' : 'Next'}
          </button>
        </div>
      )}
      {preview ? (
        <>
          <img
            className="block h-auto w-full max-w-xl rounded border border-slate-200"
            src={preview.url}
            alt={
              ar
                ? `مخطط الحضور، صفحة ${currentPage} من ${pages}`
                : `Attendance chart, page ${currentPage} of ${pages}`
            }
          />
          <ol className="sr-only" aria-label={ar ? 'بيانات المخطط' : 'Chart data'}>
            {pageRows(currentPage).map((row) => (
              <li key={row.id}>
                {row.label} · {row.evidence}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <a
              className="primary inline-flex min-h-11 items-center gap-2"
              href={preview.url}
              download={preview.filename}
            >
              <Download size={18} aria-hidden="true" />
              {pages > 1
                ? ar
                  ? 'تنزيل هذه الصفحة PNG'
                  : 'Download this page as PNG'
                : ar
                  ? 'تنزيل PNG'
                  : 'Download PNG'}
            </a>
            {preview.file && (
              <button
                className="secondary inline-flex items-center gap-2"
                type="button"
                onClick={() => void share()}
              >
                <Share2 size={18} aria-hidden="true" />
                {ar ? 'مشاركة الصورة' : 'Share image'}
              </button>
            )}
            {pages > 1 && (
              <button
                className="secondary"
                type="button"
                disabled={packing}
                onClick={() => void downloadAll()}
              >
                {packing
                  ? ar
                    ? 'جارٍ تجهيز الصور…'
                    : 'Preparing images…'
                  : ar
                    ? 'تنزيل جميع الصور (ZIP)'
                    : 'Download all images (ZIP)'}
              </button>
            )}
          </div>
        </>
      ) : (
        <p role="alert">{ar ? 'تعذر إنشاء الصورة.' : 'Could not create the image.'}</p>
      )}
      {error && (
        <p role="alert">
          {error === 'zip'
            ? ar
              ? 'تعذر تجهيز الملف المضغوط. يمكنك تنزيل كل صفحة على حدة.'
              : 'Could not prepare the ZIP. You can download each page separately.'
            : ar
              ? 'تعذرت المشاركة. يمكنك تنزيل الصورة.'
              : 'Sharing failed. You can download the image.'}
        </p>
      )}
    </section>
  )
}
