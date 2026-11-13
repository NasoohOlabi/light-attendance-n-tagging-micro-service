export function WartaqLogo() {
  return (
    <span className="wartaq-logo" lang="ar" dir="rtl">
      وارتق
    </span>
  )
}

type IconName =
  | 'book'
  | 'attendance'
  | 'notes'
  | 'students'
  | 'summary'
  | 'history'
  | 'search'
  | 'arrow'
  | 'check'
  | 'menu'
  | 'close'

const paths: Record<IconName, string> = {
  book: 'M12 20c-2.5-1.7-5.5-2-9-1V5c3.5-1 6.5-.7 9 1m0 14c2.5-1.7 5.5-2 9-1V5c-3.5-1-6.5-.7-9 1m0 14V6',
  attendance: 'M4 5h16v15H4z M8 3v4 M16 3v4 M4 9h16 M8 14l2 2 5-5',
  notes: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5',
  students: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
  summary: 'M4 20V10h4v10 M10 20V4h4v16 M16 20v-7h4v7',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16 16l4 4',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  check: 'M5 12l5 5L19 7',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'M5 5l14 14 M19 5 5 19',
}

export function WartaqIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  )
}
