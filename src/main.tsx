import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApplicationEntry } from './Entry'
import { initializeInstallPrompt } from './installPrompt'
import { registerPwa } from './pwa'
import './workspace.css'
import './roles.css'
import './index.css'
import './theme.css'

initializeInstallPrompt()
registerPwa()

const root = document.getElementById('root')
if (!root) throw new Error('Root element missing')
createRoot(root).render(
  <StrictMode>
    <ApplicationEntry />
  </StrictMode>,
)
