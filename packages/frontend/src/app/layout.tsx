import type { Metadata } from 'next';
import { Inter, Dancing_Script } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });
const dancingScript = Dancing_Script({ subsets: ['latin'], variable: '--font-dancing-script', display: 'swap' });

export const metadata: Metadata = {
  title: 'Business Funding',
  description: 'Fast, secure, and paperless funding for your business.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${dancingScript.variable}`}>
        {children}
      </body>
    </html>
  );
}

