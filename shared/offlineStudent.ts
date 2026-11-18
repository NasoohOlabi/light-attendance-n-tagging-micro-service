import { z } from 'zod'
import { eventSchema } from './ledger'

const whatsapp = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .transform((value) => value || null)
export const offlineStudentOperationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('note'),
      event: eventSchema.extend({
        payload: z.object({
          kind: z.literal('note'),
          studentId: z.uuid(),
          date: z.iso.date(),
          tags: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
          text: z.string().trim().min(1).max(10000),
        }),
      }),
    })
    .strict(),
  z
    .object({
      kind: z.literal('contact'),
      id: z.uuid(),
      studentId: z.uuid(),
      clientTime: z.iso.datetime(),
      expectedWhatsapp: whatsapp,
      whatsapp,
    })
    .strict(),
])
export const offlineStudentSyncSchema = z
  .object({
    accountId: z.string().min(1),
    operation: offlineStudentOperationSchema,
  })
  .strict()
export const offlineStudentOutcomeSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['saved', 'conflict', 'forbidden', 'id_conflict']),
  currentWhatsapp: whatsapp,
})
