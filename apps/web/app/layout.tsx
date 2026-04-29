import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Brúixola · Real-Estate Intelligence · Catalonia',
  description:
    'Brúixola — Palantir-style real-estate intelligence for Catalonia. Multi-thesis pipeline: residential buy-to-rent, coastal STR, hospital and student long-let, value-add reform. Yields gated against the índex de referència de preus de lloguer.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Allow user zoom — locking it is an anti-pattern (a11y).
  maximumScale: 5,
  themeColor: '#0a0e14',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ca"
      className={`dark ${inter.variable} ${interTight.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body
        className={`${inter.variable} ${interTight.variable} ${ibmPlexMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
