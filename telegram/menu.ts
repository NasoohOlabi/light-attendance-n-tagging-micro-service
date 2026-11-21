import { z } from 'zod'
import { neonAccountSchema } from '../shared/neon'
import { accounts } from './accounts'
import { courses } from './courses'
import { notebook } from './notebook'
import { routeGroup, type BotRoute } from './routes'
import type { BotContext, Button, Screen } from './types'

const currentAccount = z.object({ account: neonAccountSchema })

export async function renderBot(ctx: BotContext): Promise<Screen> {
  const t = (en: string, ar: string) => (ctx.lang === 'ar' ? ar : en)
  const button = (route: BotRoute, en: string, ar: string): Button => ({
    label: t(en, ar),
    action: { route },
  })
  const group = routeGroup(ctx.route)
  if (group === 'notebook') return notebook(ctx)
  if (group === 'courses') return courses(ctx)
  if (group === 'accounts') return accounts(ctx)
  if (ctx.route !== 'home')
    return {
      text: t('This screen has expired.', 'انتهت صلاحية هذه الشاشة.'),
      rows: [[button('home', 'Open menu', 'فتح القائمة')]],
    }
  const { account } = currentAccount.parse(await ctx.call('get_account'))
  const rows: Button[][] = []
  const setup = account.invitationProfile?.requiresSetup
  if (setup) {
    rows.push([
      {
        label: t('Finish account setup', 'إكمال إعداد الحساب'),
        url: new URL('/?page=app', ctx.website).href,
      },
    ])
  } else {
    if (ctx.tools.has('get_my_attendance'))
      rows.push([button('nb.mine', 'My attendance', 'سجل حضوري')])
    if (ctx.tools.has('get_notebook')) {
      rows.push([button('nb.attendance', 'Take attendance', 'تسجيل الحضور')])
      rows.push([
        button('nb.students', 'Students', 'الطلاب'),
        button('co.list', 'Courses', 'الدورات'),
      ])
      rows.push([button('nb.summary', 'Attendance summary', 'ملخص الحضور')])
      if (ctx.tools.has('save_student'))
        rows.push([
          button('nb.add', 'Add student', 'إضافة طالب'),
          button('ac.list', 'Accounts', 'الحسابات'),
        ])
    }
    rows.push([
      button('ac.profile', 'My account', 'حسابي'),
      button('sys.language', 'العربية', 'English'),
    ])
  }
  const heading = t(`Welcome, ${account.name}.`, `مرحباً ${account.name}.`)
  return {
    text: setup
      ? heading +
        '\n' +
        t(
          'Finish setting up your Wartaq account to open your notebook.',
          'أكمل إعداد حسابك في وارتق لفتح دفترك.',
        )
      : heading,
    rows,
  }
}
