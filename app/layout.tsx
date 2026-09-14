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
    description:
      'Металлическая заготовка проходит огромные станки, а каждый верный ответ даёт одно решающее вмешательство.',
    type: 'website',
    images: [
      {
        url: '/visuals/conveyor_factory_kit_preview.png',
        width: 1440,
        height: 900,
        alt: 'CONVEYOR — Deutsch unter Druck',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CONVEYOR — Deutsch unter Druck',
    description: 'Аркадный немецкий на фабрике, которая не ставится на паузу.',
    images: ['/visuals/conveyor_factory_kit_preview.png'],
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
