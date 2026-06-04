import { startInstance } from './start'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import React from 'react'

const rootElement = document.getElementById('root')
if (rootElement) {
  if (rootElement.innerHTML) {
    hydrateRoot(rootElement, <StartClient />)
  } else {
    createRoot(rootElement).render(<StartClient />)
  }
}
