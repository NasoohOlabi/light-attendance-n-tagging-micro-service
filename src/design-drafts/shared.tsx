export type DraftLanguage = 'ar' | 'en'
export type DraftProps = { language: DraftLanguage }

import { statuses, type Status } from '../../shared/ledger'

export const draftStatuses = statuses
export type DraftStatus = Status
export const draftStudents: { id: number; ar: string; en: string; status: DraftStatus }[] = [
  { id: 1, ar: 'أحمد الخطيب', en: 'Ahmad Al-Khatib', status: 'present' },
  { id: 2, ar: 'عمر الحسن', en: 'Omar Al-Hassan', status: 'present' },
  { id: 3, ar: 'يوسف عبد الله', en: 'Yusuf Abdullah', status: 'early' },
  { id: 4, ar: 'حمزة محمد', en: 'Hamza Mohammed', status: 'late' },
  { id: 5, ar: 'أنس إبراهيم', en: 'Anas Ibrahim', status: 'absent' },
  { id: 6, ar: 'بلال مصطفى', en: 'Bilal Mustafa', status: 'excused' },
]
