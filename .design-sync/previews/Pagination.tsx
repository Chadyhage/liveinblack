import { useState } from 'react'
import { Pagination } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => {
  const [page, setPage] = useState(2)
  return (
    <Stage>
      <Pagination page={page} pageCount={7} onPageChange={setPage} totalItems={132} pageSize={20} />
    </Stage>
  )
}
