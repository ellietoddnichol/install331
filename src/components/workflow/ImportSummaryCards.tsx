import React from 'react';
import { StatCard } from './StatCard';

interface ImportSummaryCardsProps {
  totalLines: number;
  exceptionCount: number;
  roomCount: number;
}

export function ImportSummaryCards({ totalLines, exceptionCount, roomCount }: ImportSummaryCardsProps) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      <StatCard label="Takeoff lines" value={totalLines} hint="In this project" />
      <StatCard label="Rooms / areas" value={roomCount} hint="Organize scope" />
      <StatCard
        label="Scope exceptions"
        value={exceptionCount}
        hint="Need attention"
        emphasize={exceptionCount > 0}
      />
    </div>
  );
}
