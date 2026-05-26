'use client';
import dynamic from 'next/dynamic';
const PricingPage = dynamic(() => import('@/components/PricingPage'), { ssr: false });
export default function Page() { return <PricingPage />; }
