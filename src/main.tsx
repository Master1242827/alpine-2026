import { startInstance } from './start'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import React from 'react'

const rootElement = document.getElementById('root')
if (rootElement) {
  if (rootElement.innerHTML) {
    hydrateRoot(rootElement, <StartClient start={startInstance} />)
  } else {
    createRoot(rootElement).render(<StartClient start={startInstance} />)
  }
}
