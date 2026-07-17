'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface RevealOnScrollProps {
  children: ReactNode;
  delay?: 0 | 1 | 2;
  className?: string;
}

const delayClass = {
  0: '',
  1: 'delay-100',
  2: 'delay-200',
} as const;

export function RevealOnScroll({ children, delay = 0, className = '' }: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`duration-[650ms] transition-all ease-out ${delayClass[delay]} ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}
