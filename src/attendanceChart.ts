import { labelChartRows } from '../shared/attendanceChart'
export { attendanceChartRows, labelChartRows, studentsPerChart } from '../shared/attendanceChart'

export function drawAttendanceChart({
  rows,
  scope,
  page,
  pages,
  language,
}: {
  rows: ReturnType<typeof labelChartRows>
  scope: string
  page: number
  pages: number
  language: 'en' | 'ar'
}) {
  const ar = language === 'ar'
  const canvas = document.createElement('canvas')
  canvas.width = 1000
  canvas.height = 290 + Math.max(1, rows.length) * 125
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.direction = ar ? 'rtl' : 'ltr'
  const edge = ar ? 950 : 50
  ctx.textAlign = ar ? 'right' : 'left'
  const fit = (value: string, width: number) => {
    if (ctx.measureText(value).width <= width) return value
    let shortened = value
    while (shortened.length && ctx.measureText(`${shortened}…`).width > width)
      shortened = shortened.slice(0, -1)
    return `${shortened}…`
  }
  ctx.fillStyle = '#007d8d'
  ctx.fillRect(0, 0, canvas.width, 12)
  ctx.fillStyle = '#103b42'
  ctx.font = 'bold 46px sans-serif'
  ctx.fillText(ar ? 'نسبة الحضور حسب الطالب' : 'Attendance rate by student', edge, 65)
  ctx.font = '38px sans-serif'
  ctx.fillText(fit(scope, 900), edge, 120)
  ctx.fillStyle = '#475569'
  ctx.font = '32px sans-serif'
  ctx.fillText(ar ? 'جميع التواريخ المسجّلة' : 'All recorded dates', edge, 165)
  ctx.fillText(
    ar ? 'نسبة الحضور = مرات الحضور ÷ الجلسات المسجّلة' : 'Attendance = present ÷ recorded sessions',
    edge,
    207,
  )
  ctx.fillText(ar ? `صفحة ${page} من ${pages}` : `Page ${page} of ${pages}`, edge, 250)
  rows.forEach((row, index) => {
    const y = 315 + index * 125
    ctx.fillStyle = row.highlighted ? '#9a4600' : '#103b42'
    ctx.font = 'bold 40px sans-serif'
    ctx.textAlign = ar ? 'right' : 'left'
    ctx.fillText(fit(row.label, 540), edge, y)
    ctx.fillStyle = '#253c42'
    ctx.font = '38px sans-serif'
    ctx.textAlign = ar ? 'left' : 'right'
    ctx.fillText(row.evidence, ar ? 50 : 950, y, 340)
    if (row.rate === null) return
    ctx.fillStyle = '#dce9e9'
    ctx.fillRect(50, y + 18, 900, 25)
    ctx.fillStyle = row.highlighted ? '#c76813' : '#007d8d'
    ctx.fillRect(ar ? 950 - 900 * row.rate : 50, y + 18, 900 * row.rate, 25)
  })
  return canvas
}
