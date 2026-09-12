import './globals.css'

export const metadata = {
  title: 'CleanCook Data Collection',
  description: 'Internal XLSForm data collection platform for CleanCook.',
}

// Mobile-first: the form UI must be genuinely good on a phone (PRD §2).
export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  )
}
