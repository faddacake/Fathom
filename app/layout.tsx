import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_')
) {
  throw new Error(
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a Clerk development key (starts with pk_test_). ' +
    'Swap in a production key from https://dashboard.clerk.com before deploying.'
  );
}

export const metadata: Metadata = {
  title: "Fathom — We measure what others can't see",
  description: 'Real-time options flow, dark pool intelligence, and congressional trade tracking.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        elements: {
          modalCloseButton: { display: 'block' },
        },
      }}
    >
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
