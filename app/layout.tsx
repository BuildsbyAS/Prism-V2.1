import type { Metadata } from 'next'
import { Retune } from 'retune'
import { GeistSans } from 'geist/font/sans'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prism — Internal feedback forms',
  description:
    'Build structured feedback flows — compare prototypes, rate, slide, choose, comment — publish via link, and read decision-ready results.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        {/* Retune visual-editing overlay — renders in development only. Press
            Option+D (Alt+D) to toggle edit mode. */}
        <Retune />
      </body>
    </html>
  )
}
