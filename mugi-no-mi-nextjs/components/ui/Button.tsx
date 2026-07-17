import Link from 'next/link';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'outline' | 'outline-inverse';

interface ButtonProps {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}

const base =
  'inline-flex items-center gap-2.5 rounded-[2px] px-8 py-4 min-h-[48px] text-[13px] tracking-[0.16em] transition-all duration-300 ease-signature whitespace-nowrap';

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-ink hover:bg-brand-deep hover:-translate-y-0.5 hover:scale-[1.015] hover:shadow-[0_12px_28px_rgba(214,169,40,0.32)] active:translate-y-0 active:scale-100',
  outline: 'border border-ink text-ink hover:border-brand-deep hover:text-brand-deep hover:-translate-y-0.5',
  'outline-inverse':
    'border border-white/60 text-white hover:border-white hover:bg-white/10 hover:-translate-y-0.5',
};

export function Button({ href, children, variant = 'primary', className = '' }: ButtonProps) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
