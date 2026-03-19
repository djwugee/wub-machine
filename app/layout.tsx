import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "The Wub Machine - Automagic Dubstep Remixer",
  description:
    "Transform any song into a dubstep or electro house remix instantly. Upload your music and let the Wub Machine work its magic - all in your browser!",
  keywords: ["dubstep", "remix", "music", "audio", "wub", "electro house", "beat"],
  authors: [{ name: "Peter Sobot" }],
  openGraph: {
    title: "The Wub Machine",
    description: "The automagic dubstep remixer - transform any song into dubstep!",
    type: "website",
    url: "https://wubmachine.com",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen wub-gradient antialiased">
        <div className="wave-container">
          <div className="wave" />
          <div className="wave" />
          <div className="wave" />
        </div>
        {children}
      </body>
    </html>
  );
}
