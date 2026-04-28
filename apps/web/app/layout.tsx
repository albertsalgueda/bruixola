import type { Metadata } from 'next';
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
