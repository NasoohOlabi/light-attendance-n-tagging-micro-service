import { neonAdminBoardSchema } from '../../shared/neon'
import { rankStudents } from '../../shared/studentSearch'
import { accounts } from '../accounts'
import type { AccountContext } from './context'
import type { Screen, Button } from '../types'

export async function browse(state: AccountContext): Promise<Screen> {
  const { ctx, t, button, back, site, denied, prompt } = state
  if (!ctx.tools.has('get_admin_board')) return denied()
  const board = neonAdminBoardSchema.parse(await ctx.call('get_admin_board'))
  const account = board.accounts.find((item) => item.authUserId === ctx.args.account)
  const page = Math.max(0, Math.min(100000, Number.parseInt(ctx.args.page ?? '0', 10) || 0))
  if (ctx.route === 'ac.list') {
    const q = ctx.args.q ?? ''
    const list = rankStudents(
      board.accounts.map((item) => ({ ...item, name: item.profileName || item.name })),
      q,
    )
    const rows = list
      .slice(page * 8, page * 8 + 8)
      .map((item) => [button(item.name, 'ac.view', { account: item.authUserId })])
    const nav: Button[] = []
    if (page) nav.push(button(t('Previous', 'السابق'), 'ac.list', { q, page: String(page - 1) }))
    if ((page + 1) * 8 < list.length)
      nav.push(button(t('Next', 'التالي'), 'ac.list', { q, page: String(page + 1) }))
    if (nav.length) rows.push(nav)
    rows.push([button(t('Search accounts', 'بحث عن حساب'), 'ac.search')])
    if (ctx.tools.has('invite_accounts'))
      rows.push([button(t('Invite account', 'دعوة حساب'), 'ac.invite')])
    rows.push(back('home'))
    return { text: t('Accounts', 'الحسابات'), rows }
  }
  if (ctx.route === 'ac.search') {
    if (ctx.input === undefined)
      return prompt(
        t('Send a name to search, or /cancel.', 'أرسل اسماً للبحث، أو /cancel للإلغاء.'),
        'ac.search',
        {},
        'ac.list',
      )
    return accounts({ ...ctx, route: 'ac.list', args: { q: ctx.input.trim() }, input: undefined })
  }
  if (ctx.route === 'ac.view') {
    if (!account) return denied()
    const role =
      account.role === 'administrator'
        ? t('Administrator', 'مدير')
        : account.role === 'teacher'
          ? t('Teacher', 'معلم')
          : account.role === 'student'
            ? t('Student', 'طالب')
            : t('No approved role', 'لا يوجد دور معتمد')
    const expired = account.expiresAt !== null && Date.parse(account.expiresAt) <= Date.now()
    const status = !account.active
      ? t('Disabled', 'معطل')
      : expired
        ? t('Expired', 'منتهي الصلاحية')
        : t('Active', 'نشط')
    return {
      text: `${account.profileName || account.name}\n${t('Role', 'الدور')}: ${role}\n${t('Status', 'الحالة')}: ${status}\n${t('Expiry', 'انتهاء الصلاحية')}: ${account.expiresAt ?? t('None', 'لا يوجد')}\n${t('Phone', 'الهاتف')}: ${account.verifiedPhone ?? '—'}`,
      rows: [
        [
          {
            label: t('Manage account securely', 'إدارة الحساب بأمان'),
            url: site({
              view: 'settings',
              settingsSection: 'accounts',
              account: account.authUserId,
            }),
          },
        ],
        back('ac.list'),
      ],
    }
  }
  return denied()
}
