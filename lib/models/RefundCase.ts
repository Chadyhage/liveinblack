import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const auditEntrySchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    actorId: { type: String, default: null },
    actorRole: { type: String, enum: ['participant', 'organizer', 'agent', 'system', 'admin'], required: true },
    action: { type: String, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
)

const proofSchema = new Schema(
  {
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, required: true },
    label: { type: String, default: '' },
  },
  { _id: false }
)

const refundCaseSchema = new Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true },
    eventId: { type: String, required: true, index: true },
    orderId: { type: String, required: true, index: true },
    buyerId: { type: String, required: true, index: true },
    organizerId: { type: String, required: true, index: true },
    cause: { type: String, enum: ['cancellation_option', 'event_cancelled', 'postponed_declined'], required: true },
    flow: { type: String, enum: ['cash_pickup', 'individual'], required: true, index: true },
    status: {
      type: String,
      enum: [
        'code_active',
        'switched_individual',
        'individual_generated',
        'info_required',
        'to_refund',
        'declared',
        'reimbursed',
        'contested',
        'contest_resolved',
        'technical_failure',
      ],
      required: true,
      index: true,
    },
    currency: { type: String, enum: ['XOF'], default: 'XOF' },
    facialMinor: { type: Number, required: true },
    serviceFeeMinor: { type: Number, required: true },
    technicalFeeMinor: { type: Number, default: 0 },
    optionFeeMinor: { type: Number, default: 0 },
    refundableMinor: { type: Number, required: true },
    transferTopupMinor: { type: Number, default: 0 },
    paymentRail: { type: String, enum: ['fedapay', 'cash', 'card', 'mobile_money', 'unknown'], default: 'unknown' },
    individualDestinationType: { type: String, enum: ['locked_mobile_money', 'bank_account', 'verified_mobile_money', null], default: null },
    originalPaymentDestinationMasked: { type: String, default: null },
    encryptedBankDetails: { type: String, default: null, select: false },
    encryptedIndividualDestination: { type: String, default: null, select: false },
    bankDetailsVerifiedAt: { type: Date, default: null },
    refundPointId: { type: String, default: null, index: true },
    refundPointName: { type: String, default: null },
    refundPointAddress: { type: String, default: null },
    codeHash: { type: String, default: null, select: false, index: true },
    encryptedPickupCode: { type: String, default: null, select: false },
    codeLast4: { type: String, default: null },
    codeCancelledAt: { type: Date, default: null },
    codeRedeemedAt: { type: Date, default: null },
    codeRedeemedByAgentId: { type: String, default: null, index: true },
    codeAttemptCount: { type: Number, default: 0 },
    codeLastAttemptAt: { type: Date, default: null },
    codeLockedAt: { type: Date, default: null },
    signatureUrl: { type: String, default: null },
    declaredReference: { type: String, default: null },
    declaredChannel: { type: String, default: null },
    declaredAt: { type: Date, default: null },
    declaredBy: { type: String, default: null },
    proofs: { type: [proofSchema], default: [] },
    contestReason: { type: String, default: null },
    contestedAt: { type: Date, default: null },
    contestResolution: { type: String, default: null },
    contestResolvedAt: { type: Date, default: null },
    contestResolvedBy: { type: String, default: null },
    auditTrail: { type: [auditEntrySchema], default: [] },
  },
  { timestamps: true }
)

refundCaseSchema.index({ orderId: 1, cause: 1 }, { unique: true })
refundCaseSchema.index({ eventId: 1, status: 1, flow: 1 })
refundCaseSchema.index({ refundPointId: 1, status: 1 })
refundCaseSchema.index(
  { organizerId: 1, declaredReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      declaredReference: { $type: 'string' },
    },
  }
)

export type RefundCaseDoc = InferSchemaType<typeof refundCaseSchema>
export type RefundCaseModel = Model<RefundCaseDoc>

export default (models.RefundCase as RefundCaseModel) || model<RefundCaseDoc>('RefundCase', refundCaseSchema)
