import { redirect } from 'next/navigation'

// Ancienne liste "quel événement scanner ce soir" — fusionnée dans
// /my-shifts, qui liste maintenant aussi les événements possédés (et pas
// seulement les affectations roster), voir lib/server/staffEvents.ts.
// Redirect de compatibilité pour tout lien existant.
export default function ScannerIndexRedirect() {
  redirect('/my-shifts')
}
