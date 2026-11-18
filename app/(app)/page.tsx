'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Home = the universe of year-books. */
export default function Home() {
  const router = useRouter();
  useEffect(() => router.replace('/universe'), [router]);
  return null;
}
