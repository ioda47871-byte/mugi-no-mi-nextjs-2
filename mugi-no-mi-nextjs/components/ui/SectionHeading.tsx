import type { ReactNode } from 'react';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  center?: boolean;
  className?: string;
  children?: ReactNode;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  center = false,
  className = '',
  children,
}: SectionHeadingProps) {
  return (
    <div
      className={`mb-14 max-w-xl ${center ? 'mx-auto text-center' : ''} ${className}`}
    >
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-3.5 text-[clamp(28px,3.6vw,42px)] leading-snug">{title}</h2>
      {description && <p className="mt-5 text-[15px] text-kura">{description}</p>}
      {children}
    </div>
  );
}
