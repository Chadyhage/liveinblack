import { getDb } from '../db/mongoose'
import Report from '../models/Report'

// Port de la section « Signalements » de src/pages/AgentPage.jsx (#9 phase
// agent/admin, tâche #103) — file de signalements d'utilisateurs, fidèle au
// legacy resolveReport (marquer traité, aucune autre action : pas de
// signalement au niveau message, voir le commentaire d'en-tête de
// lib/models/Report.ts). Le contrôle « l'appelant est bien un agent » se
// fait à la couche route (requireAgent, lib/server/agentGuard.ts) — cette
// fonction fait confiance à `agent` et ne revérifie pas le rôle, comme
// partout ailleurs dans ce port.

type ErrResult = { ok: false; status: number; error: string }

export interface AgentCaller {
  id: string
  name: string
}

export interface ReportView {
  id: string
  fromId: string
  fromName: string
  targetId: string
  targetName: string
  reason: string
  handled: boolean
  handledAt: string | null
  handledBy: string
  handledNote: string
  createdAt: string
}

function toReportView(r: {
  _id: unknown
  fromId: string
  fromName?: string | null
  targetId: string
  targetName?: string | null
  reason: string
  handled?: boolean | null
  handledAt?: Date | null
  handledBy?: string | null
  handledNote?: string | null
  createdAt: unknown
}): ReportView {
  return {
    id: String(r._id),
    fromId: r.fromId,
    fromName: r.fromName ?? '',
    targetId: r.targetId,
    targetName: r.targetName ?? '',
    reason: r.reason,
    handled: Boolean(r.handled),
    handledAt: r.handledAt ? new Date(r.handledAt).toISOString() : null,
    handledBy: r.handledBy ?? '',
    handledNote: r.handledNote ?? '',
    createdAt: new Date(r.createdAt as string).toISOString(),
  }
}

export interface ListReportsFilter {
  status?: 'open' | 'handled'
}

// Legacy (loadCollectionStrict('reports') filtré !r.handled côté queue,
// slice().reverse() côté affichage) : file par défaut = signalements
// ouverts, plus récent en premier — reproduit ici via le tri sur createdAt
// desc, filtre optionnel pour couvrir aussi l'historique traité.
export async function listReportsForAgent(filter: ListReportsFilter = {}): Promise<ReportView[]> {
  await getDb()

  const query: Record<string, unknown> = {}
  if (filter.status === 'open') query.handled = { $ne: true }
  else if (filter.status === 'handled') query.handled = true

  const reports = await Report.find(query).sort({ createdAt: -1 }).lean()
  return reports.map(toReportView)
}

export type MarkReportHandledResult = ErrResult | { ok: true; report: ReportView }

export async function markReportHandled(agent: AgentCaller, reportId: string, note?: string): Promise<MarkReportHandledResult> {
  await getDb()

  const report = await Report.findById(reportId)
  if (!report) return { ok: false, status: 404, error: 'report_not_found' }
  if (report.handled) return { ok: false, status: 409, error: 'already_handled' }

  report.handled = true
  report.handledAt = new Date()
  report.handledBy = agent.name || agent.id
  report.handledNote = note?.trim() ?? ''
  await report.save()

  return { ok: true, report: toReportView(report.toObject()) }
}
