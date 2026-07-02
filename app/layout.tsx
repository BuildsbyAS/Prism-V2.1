import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RnR 2.0 — Which review flow feels better?',
  description:
    'Vote on two Ratings & Reviews prototypes: Pills (A) vs Checkbox (B). Pick one, leave a note, see live results.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
