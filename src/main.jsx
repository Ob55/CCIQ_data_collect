import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { AuthProvider } from '@/auth/AuthProvider'
import { IntroGate } from '@/intro/IntroGate'
import { App } from '@/App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <IntroGate>
          <App />
        </IntroGate>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)
