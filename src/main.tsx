import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadSession } from './session'
import './index.css'

const session = loadSession()
const root = document.getElementById('root')
if (!root) throw new Error('Root element missing')
createRoot(root).render(
  <StrictMode>
    <App initialSession={session} />
  </StrictMode>,
)
