import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PermissionsProvider } from './contexts/PermissionsContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PermissionsProvider>
      <App />
    </PermissionsProvider>
  </StrictMode>,
)
