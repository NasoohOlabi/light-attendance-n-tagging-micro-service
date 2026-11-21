import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useLanguage } from './useLanguage'
import { resetWorkspace } from './neon'
import { clearOfflineAccess, offlineAccess } from './offlineAccess'

const accountsSchema = z.object({
  accounts: z.array(z.object({ userId: z.string(), name: z.string(), identifier: z.string() })),
})
export function AccountChoices({
  currentUserId,
  add,
  disabled = false,
}: {
  currentUserId?: string
  add: () => void
  disabled?: boolean
}) {
  const { language, t } = useLanguage()
  const [accounts, setAccounts] = useState<z.infer<typeof accountsSchema>['accounts']>([])
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void fetch('/api/device-accounts')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load accounts')
        const result = accountsSchema.parse(await response.json())
        if (active) setAccounts(result.accounts)
      })
      .catch(() => {
        if (active && currentUserId) setError(true)
      })
    return () => {
      active = false
    }
  }, [currentUserId])
  if (!currentUserId && !accounts.length) return null
  return (
    <div className="account-choices">
      <div className="account-list">
        {accounts.map((account) => (
          <button
            key={account.userId}
            type="button"
            disabled={disabled || busy || account.userId === currentUserId}
            onClick={async () => {
              setBusy(true)
              setError(false)
              try {
                const response = await fetch('/api/device-accounts/switch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: account.userId }),
                })
                if (!response.ok) throw new Error('Unable to switch accounts')
                if (offlineAccess()?.userId !== account.userId) clearOfflineAccess()
                resetWorkspace()
              } catch {
                setError(true)
                setBusy(false)
              }
            }}
          >
            <span dir="auto">
              {account.name}{' '}
              <small dir="auto">
                {account.identifier ||
                  (language === 'ar' ? 'رقم الهاتف غير متاح' : 'Phone unavailable')}
              </small>
            </span>
            {account.userId === currentUserId && (
              <small>{language === 'ar' ? 'الحساب الحالي' : 'Current account'}</small>
            )}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert">
          {language === 'ar'
            ? 'تعذر تحميل الحسابات أو تبديلها.'
            : 'Could not load or switch accounts.'}
        </p>
      )}
      <button type="button" disabled={disabled || busy} onClick={add}>
        {t('Sign in to another account')}
      </button>
    </div>
  )
}
