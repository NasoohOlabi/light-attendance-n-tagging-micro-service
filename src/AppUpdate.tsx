import { useSyncExternalStore } from 'react'
import { useLanguage } from './i18n'
import { hasWaitingPwaUpdate, subscribeToPwaUpdate } from './pwa'
import './update.css'

export function AppUpdate() {
  const { language } = useLanguage()
  const waiting = useSyncExternalStore(subscribeToPwaUpdate, hasWaitingPwaUpdate)
  if (!waiting) return null

  return (
    <div className="update-notice" role="status">
      <span>
        {language === 'ar'
          ? 'يتوفر إصدار أحدث. احفظ عملك ثم حدّث الصفحة للتحديث.'
          : 'A newer version is available. Save your work, then refresh this page to update.'}
      </span>
      <button type="button" onClick={() => window.location.reload()}>
        {language === 'ar' ? 'تحديث' : 'Refresh'}
      </button>
    </div>
  )
}
