import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { GOOGLE_FONTS_URL } from '@/lib/fonts';

export const metadata: Metadata = {
  title: 'Groundwork',
  description: 'Your life-system book: daily pages, reviews and roadmaps.',
};

export const viewport: Viewport = { themeColor: '#17181c', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Handwriting fonts (Google Fonts). Font files only download when a font is actually used. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400..900&family=Rajdhani:wght@400;500;600;700&display=swap" />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
