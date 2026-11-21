import { z } from 'zod'

export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .transform((value) => {
    const digits = value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
      const code = digit.charCodeAt(0)
      return String(code < 0x06f0 ? code - 0x0660 : code - 0x06f0)
    })
    const compact = digits.replace(/[ ()-]/g, '')
    return compact.startsWith('00')
      ? '+' + compact.slice(2)
      : /^09[0-9]{8}$/.test(compact)
        ? '+963' + compact.slice(1)
        : compact
  })
  .pipe(z.string().regex(/^\+[1-9][0-9]{6,14}$/))

const name = z.string().trim().min(1).max(49)
const role = z.enum(['administrator', 'teacher', 'student'])
export const invitationRequestSchema = z.strictObject({
  requestId: z.uuid(),
  people: z
    .array(
      z.strictObject({
        firstName: name,
        lastName: name,
        role,
        phone: phoneSchema,
        phoneConfirmed: z.literal(true),
      }),
    )
    .min(1)
    .max(50),
})
export const invitationProfileSchema = z.object({
  verifiedPhone: z.string().nullable(),
  phone: z.string().nullable(),
  requiresSetup: z.boolean(),
})
const newPassword = z.string().min(8).max(128)
export const invitationSetupInputSchema = z.strictObject({ newPassword })
export const invitationProfileInputSchema = z.strictObject({
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^\+?[0-9 ()-]+$/)
    .refine(
      (value) => value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15,
    ),
  currentPassword: z.string().min(1).max(128),
  newPassword: newPassword.optional(),
})
export const invitationResponseSchema = z.object({
  invitations: z.array(
    z.object({
      firstName: name,
      lastName: name,
      role,
      phone: phoneSchema,
      temporaryPassword: z.string(),
    }),
  ),
})

export function invitationMessage(
  item: z.infer<typeof invitationResponseSchema>['invitations'][number],
  ar: boolean,
  origin: string,
) {
  const identifier = item.phone
  const url = `${origin}/?page=app`
  if (ar) {
    return `مرحباً ${item.firstName} ${item.lastName}،\nهذا رابط الدخول إلى حسابك في وارتق:\n${url}\nرقم الهاتف: ${identifier}\nكلمة المرور المؤقتة: ${item.temporaryPassword}\nعند أول دخول، اختر كلمة مرور خاصة بك.`
  }
  return `Hello ${item.firstName} ${item.lastName},\nHere is your Wartaq sign-in link:\n${url}\nPhone: ${identifier}\nTemporary password: ${item.temporaryPassword}\nOn your first sign-in, choose a personal password.`
}
