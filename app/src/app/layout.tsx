import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppProviders } from '@/components/Providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Agent Workflow Builder — Enterprise Mini-n8n',
  description: 'Build, chain, and automate AI agent workflows with multi-layer permissions and real-time subscription streaming.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-50 antialiased min-h-screen selection:bg-cyan-500 selection:text-white`}>
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  )
}
