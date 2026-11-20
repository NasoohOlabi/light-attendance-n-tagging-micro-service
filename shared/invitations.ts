import { z } from 'zod'

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/)
const name = z.string().trim().min(1).max(49)
const role = z.enum(['administrator', 'teacher', 'student'])
export const invitationRequestSchema = z.strictObject({
  requestId: z.uuid(),
  people: z
    .array(z.strictObject({ firstName: name, lastName: name, role }))
    .min(1)
    .max(50),
})
export const invitationProfileSchema = z.object({
  username,
  phone: z.string().nullable(),
  birthDate: z.iso.date().nullable(),
  requiresSetup: z.boolean(),
})
export const invitationProfileInputSchema = z.strictObject({
  username,
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
    z.object({ firstName: name, lastName: name, role, username, temporaryPassword: z.string() }),
  ),
})

export function invitationMessage(
  item: z.infer<typeof invitationResponseSchema>['invitations'][number],
  ar: boolean,
  origin: string,
) {
  const url = `${origin}/?page=app&login=username`
  if (ar)
    return `مرحباً ${item.firstName} ${item.lastName}،\nهذا رابط الدخول إلى حسابك في وارتق:\n${url}\nاسم المستخدم: ${item.username}\nكلمة المرور المؤقتة: ${item.temporaryPassword}\nعند أول دخول، أدخل رقم هاتفك وتاريخ ميلادك واختر كلمة مرور خاصة بك. يمكنك أيضاً تغيير اسم المستخدم.`
  return `Hello ${item.firstName} ${item.lastName},\nHere is your Wartaq sign-in link:\n${url}\nUsername: ${item.username}\nTemporary password: ${item.temporaryPassword}\nOn your first sign-in, enter your phone number and date of birth and choose a personal password. You can also change your username.`
}
