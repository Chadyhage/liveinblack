import { useState } from 'react'
import { StarInput } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => {
  const [v, setV] = useState(3)
  return (
    <Stage>
      <StarInput value={v} onChange={setV} />
    </Stage>
  )
}
