import type { Metadata } from 'next';
import './globals.css';
import './party.css';
import './phone.css';

export const metadata: Metadata = {
  title: 'Silicon Racer — Big ideas. Bad brakes.',
  description: 'Build a ridiculous soapbox and race three AI rivals through Bay or Bust, a 3D San Francisco downhill course. Steer, charge and hop your way to the podium.',
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
