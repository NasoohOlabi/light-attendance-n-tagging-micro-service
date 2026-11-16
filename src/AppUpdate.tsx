import { useSyncExternalStore } from 'react'
import { useLanguage } from './i18n'
import { hasWaitingPwaUpdate, subscribeToPwaUpdate } from './pwa'
import './update.css'

export function AppUpdate() {
  const { language } = useLanguage()
  const waiting = useSyncExternalStore(subscribeToPwaUpdate, hasWaitingPwaUpdate)
  if (!waiting) return null

  return (
    <p className="update-notice" role="status">
      {language === 'ar'
        ? 'يتوفر إصدار أحدث. احفظ عملك ثم حدّث الصفحة للتحديث.'
        : 'A newer version is available. Save your work, then refresh this page to update.'}
    </p>
  )
}
