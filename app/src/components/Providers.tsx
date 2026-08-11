'use client'

import React from 'react'
import { NhostProvider } from '@nhost/react'
import { nhost } from '@/lib/nhost'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <NhostProvider nhost={nhost}>
      {children}
    </NhostProvider>
  )
}
