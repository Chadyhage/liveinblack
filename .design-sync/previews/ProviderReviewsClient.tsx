import { ProviderReviewsClient } from 'liveinblack-ui'
import { Stage } from './_stage'

const REVIEWS = [
  {
    id: 'rev_1',
    authorId: 'u_awa',
    authorName: 'Awa Diallo',
    rating: 5,
    comment: 'DJ au top, ambiance garantie toute la soirée. Matériel professionnel, ponctuel.',
    status: 'published' as const,
    verified: true,
    reply: { text: 'Merci Awa, ravi que la soirée t\'ait plu !' },
    edited: false,
    createdAt: '2026-07-02T18:00:00.000Z',
  },
  {
    id: 'rev_2',
    authorId: 'u_kenji',
    authorName: 'Kenji Traoré',
    rating: 4,
    comment: "Très bonne prestation, léger retard à l'installation.",
    status: 'published' as const,
    verified: true,
    reply: null,
    edited: false,
    createdAt: '2026-06-18T21:30:00.000Z',
  },
]

export const WithReviews = () => (
  <Stage>
    <ProviderReviewsClient
      providerId="prov_nova"
      providerName="Nova Entertainment"
      isAuthenticated
      isSelf={false}
      initialReviews={REVIEWS}
      initialMyReview={null}
    />
  </Stage>
)
