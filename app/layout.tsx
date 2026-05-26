import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fathom — We measure what others can\'t see',
  description: 'Real-time options flow, dark pool intelligence, and congressional trade tracking.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <link
            href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
