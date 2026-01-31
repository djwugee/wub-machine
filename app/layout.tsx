import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'Wub Machine - Client-Side Audio Remix Engine',
  description:
    'Transform any audio file into dubstep or electro-house remixes instantly. All processing happens in your browser - your files never leave your device. Privacy-first audio remixing powered by Web Audio API.',
  keywords: [
    'audio remix',
    'dubstep generator',
    'electro house',
    'web audio api',
    'client-side audio processing',
    'music production',
    'audio effects',
    'wub machine',
  ],
  authors: [{ name: 'Wub Machine' }],
  openGraph: {
    title: 'Wub Machine - Client-Side Audio Remix Engine',
    description: 'Transform any audio file into dubstep or electro-house remixes instantly.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#00d9a3',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
