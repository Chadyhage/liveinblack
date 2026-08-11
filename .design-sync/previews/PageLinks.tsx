import { PageLinks } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage>
    <PageLinks page={2} pageCount={5} makeHref={(p) => `/providers?page=${p}`} totalItems={94} pageSize={20} />
  </Stage>
)
