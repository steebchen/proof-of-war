import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { DojoProvider } from './providers/DojoProvider.tsx'
import { StarknetProvider } from './providers/StarknetProvider.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StarknetProvider>
      <DojoProvider>
        <App />
      </DojoProvider>
    </StarknetProvider>
  </React.StrictMode>,
)
