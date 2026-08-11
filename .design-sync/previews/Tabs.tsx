import { useState } from 'react'
import { Tabs } from 'liveinblack-ui'
import { Stage } from './_stage'

export const AuthMode = () => {
  const [mode, setMode] = useState('login')
  return (
    <Stage>
      <Tabs
        value={mode}
        onChange={setMode}
        options={[
          { value: 'login', label: 'Connexion' },
          { value: 'register', label: 'Inscription' },
        ]}
        style={{ maxWidth: 320 }}
      />
    </Stage>
  )
}

export const ThreeOptions = () => {
  const [tab, setTab] = useState('en-cours')
  return (
    <Stage>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'en-cours', label: 'En cours' },
          { value: 'passes', label: 'Passés' },
          { value: 'brouillons', label: 'Brouillons' },
        ]}
        style={{ maxWidth: 400 }}
      />
    </Stage>
  )
}
