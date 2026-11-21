import { z } from 'zod'
import { profileUpdateSchema } from '../../server/profile'
import type { AccountContext } from './context'
import type { Screen, Button } from '../types'

const profileSchema = z.object({ name: z.string(), image: z.string().nullable() })

export async function profile(state: AccountContext): Promise<Screen> {
  const { ctx, t, button, back, site, denied, prompt } = state
  if (
    ctx.route === 'ac.profile' ||
    ctx.route === 'ac.profile.name' ||
    ctx.route === 'ac.profile.save'
  ) {
    if (!ctx.tools.has('get_profile')) return denied()
    const profile = profileSchema.parse(await ctx.call('get_profile'))
    if (ctx.route === 'ac.profile') {
      const rows: Button[][] = []
      if (ctx.tools.has('update_profile'))
        rows.push([button(t('Edit name', 'تعديل الاسم'), 'ac.profile.name')])
      rows.push(
        [
          {
            label: t('Photo, phone and password', 'الصورة والهاتف وكلمة المرور'),
            url: site({ view: 'profile' }),
          },
        ],
        back('home'),
      )
      return {
        text: `${t('Profile', 'الملف الشخصي')}\n${t('Name', 'الاسم')}: ${profile.name}\n${t('Photo', 'الصورة')}: ${profile.image ? t('Set', 'موجودة') : t('Not set', 'غير موجودة')}`,
        rows,
      }
    }
    if (!ctx.tools.has('update_profile')) return denied()
    if (ctx.route === 'ac.profile.name') {
      if (ctx.input === undefined)
        return prompt(
          t(
            'Send your new display name, or /cancel.',
            'أرسل اسم العرض الجديد، أو /cancel للإلغاء.',
          ),
          'ac.profile.name',
          {},
          'ac.profile',
        )
      const parsed = profileUpdateSchema.safeParse({ name: ctx.input })
      if (!parsed.success)
        return prompt(
          t('Enter a name of 1–120 characters.', 'أدخل اسماً من ١ إلى ١٢٠ حرفاً.'),
          'ac.profile.name',
          {},
          'ac.profile',
        )
      return {
        text: `${t('Change your name to', 'تغيير الاسم إلى')}: ${parsed.data.name}?`,
        rows: [
          [
            button(t('Confirm', 'تأكيد'), 'ac.profile.save', {
              name: parsed.data.name,
              expected: profile.name,
            }),
          ],
          back('ac.profile'),
        ],
      }
    }
    const parsed = profileUpdateSchema.safeParse({ name: ctx.args.name })
    if (!parsed.success || ctx.args.expected === undefined) return denied()
    if (profile.name !== ctx.args.expected)
      return {
        text: t(
          'Your name changed. Open your profile and try again.',
          'تغير اسمك. افتح ملفك الشخصي وحاول مجدداً.',
        ),
        rows: [back('ac.profile')],
      }
    await ctx.call('update_profile', { input: parsed.data })
    return { text: t('Name saved.', 'تم حفظ الاسم.'), rows: [back('ac.profile')] }
  }
  return denied()
}
