'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { BookView } from '@/components/book/book-view';

export default function BookPage() {
  const params = useParams<{ year: string; page: string }>();
  const year = Number(params.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    return <p className="p-8 text-center text-zinc-300">That book doesn&apos;t exist.</p>;
  }
  return (
    <Suspense>
      <BookView year={year} pageId={decodeURIComponent(params.page)} />
    </Suspense>
  );
}
