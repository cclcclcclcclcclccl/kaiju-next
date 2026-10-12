import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X, ArrowUpRight, Sword } from 'lucide-react';
import type { Hero } from './model.ts';
export function Portrait({ hero, className = '' }: { hero: Hero | undefined; className?: string }) {
  return (
    <span className={'portrait ' + className}>
      <span>{hero?.name.slice(0, 1) ?? '+'}</span>
      {hero && (
        <img
          src={hero.portrait}
          key={hero.id}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.opacity = '0';
          }}
        />
      )}
    </span>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closer = useRef(onClose);
  closer.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closer.current();
      if (e.key === 'Tab') {
        const nodes = [
          ...ref.current!.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
          ),
        ].filter((n) => n.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handle);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={'dialog ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <div>
            <p className="eyebrow">NEXT / YOUR PLAYBOOK</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭窗口">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Sword size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function SourceLink({ hero }: { hero: Hero }) {
  return (
    <a className="subtle-link" href={hero.source} target="_blank" rel="noreferrer">
      查看官方资料 <ArrowUpRight size={13} />
    </a>
  );
}
