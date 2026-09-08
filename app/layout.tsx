import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Doodle Derby — Bad ideas. Great races.',
  description: 'Build a ridiculous soapbox, charge your spring, and race a friend downhill. A local two-player 3D party game.',
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
