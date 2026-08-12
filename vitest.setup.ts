// Setup du projet "frontend" (vitest.config.ts) — matchers DOM (toBeInTheDocument,
// toHaveTextContent, etc.) pour les tests de composants React sous jsdom.
// N'affecte jamais le projet "server" (backend), chargé uniquement ici.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Démontage explicite après CHAQUE test — sans lui, plusieurs render()
// dans le même fichier accumulent leurs éléments dans le même document DOM
// jsdom partagé, faisant échouer getByRole/getByText avec "plusieurs
// éléments trouvés" dès le 2e test (confirmé en écrivant les premiers
// tests de ce lot). `test.globals` n'étant pas activé sur ce projet,
// l'auto-cleanup intégré de Testing Library ne se déclenche pas tout seul.
afterEach(() => {
  cleanup()
})
