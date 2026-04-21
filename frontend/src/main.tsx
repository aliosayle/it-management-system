import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import config from 'devextreme/core/config'
import './index.css'
import './styles/app-theme.css'
import './styles/datagrid-compact.css'
import './styles/devextreme-license-fix.css'
import App from './App.tsx'

config({ licenseKey: 'non-commercial-and-evaluation' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
