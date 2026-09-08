import type { Metadata } from 'next';
import './globals.css';
import './party.css';
import './phone.css';

export const metadata: Metadata = {
  title: 'Silicon Racer — Big ideas. Bad brakes.',
  description: 'Build something ridiculous and race it downhill. A 3D party game for 2–4 friends, with a full race view on every phone.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
