'use client';

import { useParams } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import { MapCanvas } from '@/components/maps/map-canvas';

export default function MapPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ReactFlowProvider>
      <MapCanvas mapId={id} />
    </ReactFlowProvider>
  );
}
