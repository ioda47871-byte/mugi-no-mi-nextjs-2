import Breadcrumbs from '@/components/Breadcrumbs';
import JsonLd from '@/components/JsonLd';
import { breadcrumbJsonLd } from '@/lib/structured-data';
import type { ReactNode } from 'react';

export default function InfoPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  const crumbs = [
    { name: 'ホーム', href: '/' },
    { name: title, href: null },
  ];
  return (
    <div className="container-page py-6 sm:py-10">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <div className="mt-4 max-w-prose">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {lead ? <p className="mt-3 prose-body">{lead}</p> : null}
        <div className="mt-6 space-y-8">{children}</div>
      </div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="border-l-4 border-accent pl-3 text-base font-bold text-ink">{heading}</h2>
      <div className="mt-3 space-y-3 prose-body">{children}</div>
    </section>
  );
}

export function Unset({ label }: { label: string }) {
  return (
    <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">
      未設定（{label}）
    </span>
  );
}
