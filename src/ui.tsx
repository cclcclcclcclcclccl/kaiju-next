import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  X,
  Coins,
  Gem,
  Boxes,
  ArrowUpRight,
  CircleCheck,
  CircleAlert,
  ScanLine,
} from 'lucide-react';
import type { Economy, Inventory, SearchResult } from './core/model.ts';

export const statusLabels: Record<SearchResult['status'], string> = {
  counterexample: '发现反例',
  'bounded-clear': '范围内未发现反例',
  inconclusive: '尚不能下结论',
};
export function Status({ status }: { status: SearchResult['status'] }) {
  const Icon =
    status === 'counterexample' ? CircleAlert : status === 'bounded-clear' ? CircleCheck : ScanLine;
  return (
    <span className={'status status-' + status}>
      <Icon size={13} />
      {statusLabels[status]}
    </span>
  );
}
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
        );
        if (!nodes?.length) {
          event.preventDefault();
          return;
        }
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === ref.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={'modal ' + (wide ? 'modal-wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <header className="modal-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function ResourceIcon({ index, size = 18 }: { index: number; size?: number }) {
  const Icon = [Coins, Gem, Boxes][index % 3];
  return <Icon size={size} strokeWidth={1.6} />;
}
export function EconomyMap({
  model,
  inventory,
  activeAction,
}: {
  model: Economy;
  inventory?: Inventory;
  activeAction?: string | null;
}) {
  const n = model.resources.length;
  const positions = model.resources.map((_, i) =>
    n <= 3
      ? { x: n === 2 ? 180 + i * 320 : 100 + i * 240, y: 103 }
      : {
          x: 340 + 240 * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n),
          y: 190 + 130 * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n),
        },
  );
  return (
    <div className={'economy-map ' + (n > 3 ? 'economy-map-many' : '')}>
      <div className="map-caption">
        <span className="live-dot" />
        资源流转图<span>{inventory ? '回放状态' : '初始状态'}</span>
      </div>
      <svg
        viewBox={n <= 3 ? '0 0 680 242' : '0 0 680 380'}
        role="img"
        aria-label="资源之间的消耗和产出关系"
      >
        <defs>
          <marker
            id="arrow-muted"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </marker>
        </defs>
        {model.actions.map((action, index) => {
          const costs = Object.keys(action.cost).filter((key) => action.cost[key] > 0);
          const gains = Object.keys(action.gain).filter((key) => action.gain[key] > 0);
          return costs.flatMap((from) =>
            gains.map((to) => {
              const i = model.resources.findIndex((r) => r.id === from),
                j = model.resources.findIndex((r) => r.id === to);
              const a = positions[i],
                b = positions[j];
              if (!a || !b) return null;
              const returning = n <= 3 && j <= i;
              const path = returning
                ? 'M ' +
                  a.x +
                  ' ' +
                  (a.y + 40) +
                  ' C ' +
                  a.x +
                  ' 227,' +
                  b.x +
                  ' 227,' +
                  b.x +
                  ' ' +
                  (b.y + 40)
                : (() => {
                    const dx = b.x - a.x,
                      dy = b.y - a.y,
                      length = Math.hypot(dx, dy) || 1;
                    const ux = dx / length,
                      uy = dy / length;
                    const offset = Math.min(
                      66 / Math.max(Math.abs(ux), 0.001),
                      43 / Math.max(Math.abs(uy), 0.001),
                    );
                    return (
                      'M ' +
                      (a.x + ux * offset) +
                      ' ' +
                      (a.y + uy * offset) +
                      ' L ' +
                      (b.x - ux * offset) +
                      ' ' +
                      (b.y - uy * offset)
                    );
                  })();
              return (
                <g
                  key={action.id + from + to}
                  className={'map-edge ' + (activeAction === action.id ? 'active' : '')}
                >
                  <path d={path} markerEnd="url(#arrow-muted)" fill="none" />
                  {costs.length === 1 && gains.length === 1 && n <= 3 && (
                    <g
                      transform={
                        'translate(' + (a.x + b.x) / 2 + ',' + (returning ? 205 : a.y - 19) + ')'
                      }
                    >
                      <rect x="-40" y="-11" width="80" height="22" rx="11" />
                      <text textAnchor="middle" y="4">
                        {String(index + 1).padStart(2, '0')} · {action.name}
                      </text>
                    </g>
                  )}
                </g>
              );
            }),
          );
        })}
        {model.resources.map((resource, i) => {
          const pos = positions[i],
            value = inventory?.[resource.id] ?? resource.initial;
          const active = activeAction && model.actions.find((a) => a.id === activeAction);
          const touched =
            active && ((active.cost[resource.id] ?? 0) > 0 || (active.gain[resource.id] ?? 0) > 0);
          const Icon = [Coins, Gem, Boxes][i % 3];
          return (
            <g
              key={resource.id}
              transform={'translate(' + pos.x + ',' + pos.y + ')'}
              className={'map-node ' + (touched ? 'touched' : '')}
            >
              <rect x="-62" y="-39" width="124" height="78" rx="13" />
              <circle cx="-37" cy="-11" r="15" />
              <Icon x="-46" y="-20" size={18} strokeWidth={1.7} />
              <text className="map-name" x="-14" y="-7">
                {resource.name.length > 4 ? resource.name.slice(0, 4) + '…' : resource.name}
              </text>
              <text className="map-value" x="-43" y="23">
                {value}
              </text>
              <text className="map-unit" x="44" y="22" textAnchor="end">
                库存
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-legend">
        <span>
          <i />
          资源
        </span>
        <span>
          <ArrowUpRight size={12} />
          交易 / 制造
        </span>
        <span>按动作定义的成本与产出推演</span>
      </div>
    </div>
  );
}
