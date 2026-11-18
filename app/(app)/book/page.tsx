'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { todayHref } from '@/lib/book';

export default function BookIndex() {
  const router = useRouter();
  useEffect(() => router.replace(todayHref()), [router]);
  return null;
}
