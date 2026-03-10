import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Wub Machine - AI Remix Generator',
  description:
    'Transform your music into electronic remixes using AI-powered beat detection and synthesis. Dubstep, Electro House, and more.',
  keywords: [
    'remix',
    'music',
    'ai',
    'dubstep',
    'electro house',
    'beat detection',
    'audio processing',
  ],
  authors: [{ name: 'Peter Sobot' }],
  creator: 'Peter Sobot',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://wub-machine.vercel.app',
    siteName: 'Wub Machine',
    title: 'Wub Machine - AI Remix Generator',
    description:
      'Transform your music into electronic remixes using AI-powered beat detection and synthesis.',
    images: [
      {
        url: 'https://wub-machine.vercel.app/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Wub Machine',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wub Machine - AI Remix Generator',
    description:
      'Transform your music into electronic remixes using AI-powered beat detection and synthesis.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  userScalable: true,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className="bg-background text-foreground antialiased">
        <div className="relative flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
        </div>
        <Analytics />
      </body>
    </html>
  )
}
