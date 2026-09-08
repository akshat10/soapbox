import type { Metadata } from 'next';
import './globals.css';
import './party.css';
import './phone.css';

export const metadata: Metadata = {
  title: 'Doodle Derby — Bad ideas. Great races.',
  description: 'Build a ridiculous soapbox, charge your spring, and race a friend downhill. A two-player 3D party game. Play together with your phones as controllers.',
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
