import { z } from 'zod'

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/)
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
  username: username.nullable(),
  verifiedPhone: z.string().nullable(),
  phone: z.string().nullable(),
  birthDate: z.iso.date().nullable(),
  requiresSetup: z.boolean(),
})
export const invitationProfileInputSchema = z.strictObject({
  username: username.nullable(),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^\+?[0-9 ()-]+$/)
    .refine(
      (value) => value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15,
    ),
  birthDate: z.iso.date().refine((value) => value <= new Date().toISOString().slice(0, 10)),
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128).optional(),
})
export const invitationResponseSchema = z.object({
  invitations: z.array(
    z.union([
      z.object({
        firstName: name,
        lastName: name,
        role,
        phone: phoneSchema,
        temporaryPassword: z.string(),
      }),
      z.object({ firstName: name, lastName: name, role, username, temporaryPassword: z.string() }),
    ]),
  ),
})

export function invitationMessage(
  item: z.infer<typeof invitationResponseSchema>['invitations'][number],
  ar: boolean,
  origin: string,
) {
  const isPhone = 'phone' in item
  const identifier = isPhone ? item.phone : item.username
  const url = `${origin}/?page=app&login=${isPhone ? 'phone' : 'username'}`
  if (ar)
    return `مرحباً ${item.firstName} ${item.lastName}،\nهذا رابط الدخول إلى حسابك في وارتق:\n${url}\n${isPhone ? 'رقم الهاتف' : 'اسم المستخدم'}: ${identifier}\nكلمة المرور المؤقتة: ${item.temporaryPassword}\nعند أول دخول، أكمل بياناتك واختر كلمة مرور خاصة بك.`
  return `Hello ${item.firstName} ${item.lastName},\nHere is your Wartaq sign-in link:\n${url}\n${isPhone ? 'Phone' : 'Username'}: ${identifier}\nTemporary password: ${item.temporaryPassword}\nOn your first sign-in, complete your details and choose a personal password.`
}
