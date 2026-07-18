import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `cron_locks/{lockId}` — verrou global empêchant deux exécutions
// concurrentes du cron de versement (audit fix #72 côté legacy).
const cronLockSchema = new Schema(
  {
    _id: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
  },
  { timestamps: true }
)

export type CronLockDoc = InferSchemaType<typeof cronLockSchema>
export type CronLockModel = Model<CronLockDoc>

export default (models.CronLock as CronLockModel) || model<CronLockDoc>('CronLock', cronLockSchema)
