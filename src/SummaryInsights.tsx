import { useState } from 'react'
import { type Attendance, type Student } from '../shared/ledger'
import { useLanguage } from './useLanguage'
import './SummaryInsights.css'

type Record = { value: Attendance }

export function SummaryInsights({ students, records }: { students: Student[]; records: Record[] }) {
  const { language, t } = useLanguage()
  const [openDates, setOpenDates] = useState<string[]>([])
  const [showRemaining, setShowRemaining] = useState(false)
  const ar = language === 'ar'
  const names = new Map(students.map((student) => [student.studentId, student.name]))
  const grouped = new Map<
    string,
    { date: string; entries: Record[]; absent: number; excused: number }
  >()
  for (const record of records) {
    const { date, status } = record.value
    const day = grouped.get(date) ?? { date, entries: [], absent: 0, excused: 0 }
    day.entries.push(record)
    if (status === 'absent') day.absent += 1
    if (status === 'excused') day.excused += 1
    grouped.set(date, day)
  }
  const dates = [...grouped.values()].sort(
    (a, b) => b.absent - a.absent || b.date.localeCompare(a.date),
  )
  const max = Math.max(1, ...dates.map((date) => date.absent))

  function dateRow(day: (typeof dates)[number]) {
    return (
      <li key={day.date} className="border-b border-slate-300 py-3 @min-[72rem]/overview:py-1.5">
        <details
          onToggle={(event) => {
            const open = event.currentTarget.open
            setOpenDates((previous) =>
              open
                ? [...previous.filter((date) => date !== day.date), day.date]
                : previous.filter((date) => date !== day.date),
            )
          }}
        >
          <summary className="cursor-pointer min-h-11 py-2">
            <time dateTime={day.date} dir="ltr">
              {day.date}
            </time>
            {' · '}
            {ar
              ? `غائب: ${day.absent}، بعذر: ${day.excused}، مسجل: ${day.entries.length}`
              : `Absent: ${day.absent}, Excused: ${day.excused}, Recorded: ${day.entries.length}`}
          </summary>
          {openDates.includes(day.date) && (
            <ul className="space-y-1 pt-2">
              {day.entries.map(({ value }) => (
                <li
                  key={`${value.studentId}:${value.enrollmentId ?? ''}`}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <span dir="auto">
                    {names.get(value.studentId) ?? (ar ? 'طالب غير معروف' : 'Unknown student')}
                  </span>
                  <span>{t(value.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
        <meter
          className="summary-insights-meter w-full @min-[72rem]/overview:block"
          min={0}
          max={max}
          value={day.absent}
          aria-label={
            ar ? `الغياب في ${day.date}: ${day.absent}` : `Absences on ${day.date}: ${day.absent}`
          }
        />
      </li>
    )
  }

  return (
    <section
      className="mb-8 @min-[72rem]/overview:mb-0"
      aria-label={ar ? 'الغياب حسب الجلسة' : 'Absences by session'}
    >
      <h3 className="font-semibold">{ar ? 'الغياب حسب الجلسة' : 'Absences by session'}</h3>
      <p className="muted">
        {ar
          ? 'الجلسات مرتبة حسب عدد حالات الغياب المسجلة. العذر منفصل. افتح التاريخ لعرض الأسماء والحالات.'
          : 'Sessions are ranked by explicit absences. Excused marks are separate. Open a date to see names and marks.'}
      </p>
      {!dates.length ? (
        <p className="muted">{ar ? 'لا توجد سجلات حضور بعد.' : 'No attendance records yet.'}</p>
      ) : (
        <>
          {dates.every((date) => date.absent === 0) && (
            <p className="muted">
              {ar ? 'لا توجد حالات غياب مسجلة.' : 'No explicit absences recorded.'}
            </p>
          )}
          <ol>{dates.slice(0, 5).map(dateRow)}</ol>
          {dates.length > 5 && (
            <details
              className="mt-3"
              onToggle={(event) => {
                const open = event.currentTarget.open
                setShowRemaining(open)
                if (!open) {
                  const remaining = new Set(dates.slice(5).map((day) => day.date))
                  setOpenDates((previous) => previous.filter((date) => !remaining.has(date)))
                }
              }}
            >
              <summary className="cursor-pointer min-h-11 py-2">
                {ar ? 'عرض بقية التواريخ' : 'Show remaining dates'}
              </summary>
              {showRemaining && <ol>{dates.slice(5).map(dateRow)}</ol>}
            </details>
          )}
        </>
      )}
    </section>
  )
}
