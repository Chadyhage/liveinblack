import { ProviderCatalogInquiry } from 'liveinblack-ui'
import { Stage } from './_stage'

const ITEM = {
  id: 'pack-dj-4h',
  name: 'Pack DJ + sonorisation — 4h',
  description: 'DJ professionnel, matériel de sonorisation inclus, éclairage de base.',
  price: 45000,
  currency: 'XOF',
  unit: 'forfait',
  category: 'DJ & Sonorisation',
}

export const Authenticated = () => (
  <Stage>
    <ProviderCatalogInquiry
      providerId="prov_nova"
      providerName="Nova Entertainment"
      isAuthenticated
      item={ITEM}
      catalogDefaultCurrency="XOF"
    />
  </Stage>
)
