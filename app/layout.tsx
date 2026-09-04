import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin', 'cyrillic'],
});
const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
  title: 'CONVEYOR — Deutsch unter Druck',
  description:
    'Аркадная фабрика, где немецкий язык управляет каждым рискованным движением.',
  openGraph: {
    title: 'CONVEYOR — Deutsch unter Druck',
    description: 'Три линии. Три терминала. Один сгорающий импульс.',
    type: 'website',
    images: [
      {
        url: '/og.webp',
        width: 1536,
        height: 1024,
        alt: 'CONVEYOR — Deutsch unter Druck',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CONVEYOR — Deutsch unter Druck',
    description: 'Аркадный немецкий на фабрике, которая не ставится на паузу.',
    images: ['/og.webp'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
