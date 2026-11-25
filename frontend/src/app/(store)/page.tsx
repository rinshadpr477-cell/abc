import { Suspense } from 'react';
import { Catalogue } from '@/components/catalog/catalogue';
import { Skeleton } from '@/components/ui/basic';

export default function HomePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Catalogue />
    </Suspense>
  );
}
