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
        ? 'يتوفر إصدار أحدث. أكمل حفظ عملك، ثم أغلق جميع نوافذ وارتق في المتصفح والتطبيق وأعد فتحه للتحديث.'
        : 'A newer version is available. Finish saving your work, then close all Wartaq browser and app windows and reopen to update.'}
    </p>
  )
}
