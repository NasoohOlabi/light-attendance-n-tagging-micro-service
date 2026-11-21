import { z } from 'zod'
import { invitationRequestSchema, phoneSchema } from '../../shared/invitations'
import type { AccountContext } from './context'
import type { Screen } from '../types'

const invitationResultSchema = z.object({ requestId: z.uuid(), url: z.url() })

export async function invite(state: AccountContext): Promise<Screen> {
  const { ctx, t, button, back, denied, prompt } = state
  if (!ctx.tools.has('get_admin_board')) return denied()
  if (!ctx.tools.has('invite_accounts')) return denied()
  if (ctx.route === 'ac.invite') {
    return {
      text: t('Choose a role for the invitation.', 'اختر دور الحساب المدعو.'),
      rows: [
        [
          button(t('Administrator', 'مدير'), 'ac.invite.name', { role: 'administrator' }),
          button(t('Teacher', 'معلم'), 'ac.invite.name', { role: 'teacher' }),
        ],
        [button(t('Student', 'طالب'), 'ac.invite.name', { role: 'student' })],
        back('ac.list'),
      ],
    }
  }
  const role = z.enum(['administrator', 'teacher', 'student']).safeParse(ctx.args.role)
  if (!role.success) return denied()
  if (ctx.route === 'ac.invite.name') {
    if (ctx.input === undefined)
      return prompt(
        t(
          'Send first and last name separated by a comma, or /cancel.',
          'أرسل الاسم الأول واسم العائلة مفصولين بفاصلة إنجليزية، أو /cancel للإلغاء.',
        ),
        'ac.invite.name',
        ctx.args,
        'ac.invite',
      )
    const parts = ctx.input.split(/[,\u060c]/).map((part) => part.trim())
    const names = z.tuple([z.string().min(1).max(49), z.string().min(1).max(49)]).safeParse(parts)
    if (!names.success)
      return prompt(
        t(
          'Enter first and last name separated by one comma.',
          'أدخل الاسم الأول واسم العائلة بينهما فاصلة إنجليزية.',
        ),
        'ac.invite.name',
        ctx.args,
        'ac.invite',
      )
    return prompt(
      t(
        'Send their phone number with country code, or /cancel.',
        'أرسل رقم هاتفه مع رمز البلد، أو /cancel للإلغاء.',
      ),
      'ac.invite.phone',
      { role: role.data, firstName: names.data[0], lastName: names.data[1] },
      'ac.invite',
    )
  }
  if (ctx.route === 'ac.invite.phone') {
    if (ctx.input === undefined)
      return prompt(
        t(
          'Send their phone number with country code, or /cancel.',
          'أرسل رقم هاتفه مع رمز البلد، أو /cancel للإلغاء.',
        ),
        'ac.invite.phone',
        ctx.args,
        'ac.invite',
      )
    const phone = phoneSchema.safeParse(ctx.input)
    if (!phone.success)
      return prompt(
        t('Enter a valid international phone number.', 'أدخل رقم هاتف دولياً صحيحاً.'),
        'ac.invite.phone',
        ctx.args,
        'ac.invite',
      )
    const input = invitationRequestSchema.safeParse({
      requestId: crypto.randomUUID(),
      people: [
        {
          firstName: ctx.args.firstName,
          lastName: ctx.args.lastName,
          role: role.data,
          phone: phone.data,
          phoneConfirmed: true,
        },
      ],
    })
    if (!input.success) return denied()
    return {
      text: `${t('Have you asked this person directly and confirmed their phone number?', 'هل سألت هذا الشخص مباشرة وأكدت رقم هاتفه؟')}\n${input.data.people[0].firstName} ${input.data.people[0].lastName}\n${phone.data}\n${role.data}`,
      rows: [
        [
          button(t('Yes, confirmed directly', 'نعم، أكدته مباشرة'), 'ac.invite.send', {
            payload: JSON.stringify(input.data),
            role: role.data,
          }),
        ],
        back('ac.invite'),
      ],
    }
  }
  if (ctx.route === 'ac.invite.send') {
    const raw = z.string().safeParse(ctx.args.payload)
    if (!raw.success) return denied()
    let input: z.infer<typeof invitationRequestSchema>
    try {
      input = invitationRequestSchema.parse(JSON.parse(raw.data))
    } catch {
      return denied()
    }
    const result = invitationResultSchema.parse(await ctx.call('invite_accounts', { input }))
    const url = new URL(result.url)
    if (url.origin !== new URL(ctx.website).origin || result.requestId !== input.requestId)
      throw new Error('Invalid invitation link')
    return {
      text: t(
        'Invitation created. Open the private, one-time message on the website. If delivery failed, check accounts before retrying.',
        'تم إنشاء الدعوة. افتح الرسالة الخاصة لمرة واحدة على الموقع. إذا فشل التسليم فتحقق من الحسابات قبل إعادة المحاولة.',
      ),
      rows: [
        [{ label: t('Open private invitation', 'فتح الدعوة الخاصة'), url: url.href }],
        back('ac.list'),
      ],
    }
  }
  return denied()
}
