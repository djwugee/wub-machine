import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" })

export const metadata: Metadata = {
  title: "The Wub Machine - Automatic Music Remixer",
  description:
    "The automagic dubstep and electro house remixer. Turn your favourite songs into dubstep or electro house remixes, then download and share! Runs entirely in your browser.",
  openGraph: {
    title: "The Wub Machine",
    description: "The automagic dubstep remixer. Turn any song into a remix.",
    type: "website",
  },
}

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
