import { redirect } from 'next/navigation'

// Ancienne URL, renommée /on-site-sales pour ne plus se confondre avec
// app/(app)/agent — redirect de compatibilité pour tout lien existant.
export default async function AgentSalesRedirect({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  redirect(`/on-site-sales/${eventId}`)
}
