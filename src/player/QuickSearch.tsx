import { useEffect, useRef, useState } from 'react';
import { Search, ArrowUpRight, X } from 'lucide-react';
import { heroes } from './catalog.ts';
import type { Hero } from './model.ts';
import { Portrait } from './ui.tsx';
import { searchTasks } from './navigation.ts';
import type { taskLinks } from './navigation.ts';
export default function QuickSearch({
  onHero,
  onTask,
}: {
  onHero: (h: Hero) => void;
  onTask: (t: (typeof taskLinks)[number]) => void;
}) {
  const [query, setQuery] = useState(''),
    [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    box = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase(),
    matched = q
      ? heroes.filter((h) => h.name.includes(q) || h.slug.toLowerCase().includes(q)).slice(0, 6)
      : [];
  const tasks = searchTasks(query);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const close = () => {
    setQuery('');
    setOpen(false);
  };
  return (
    <div
      className="global-search command-search"
      ref={box}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label>
        <Search size={15} />
        <input
          ref={input}
          aria-label="全局搜索英雄或功能"
          placeholder="搜英雄、皮肤、BP、复盘…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              box.current?.querySelector<HTMLButtonElement>('.search-popover > button')?.focus();
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (matched[0]) {
                onHero(matched[0]);
                close();
              } else if (tasks[0]) {
                onTask(tasks[0]);
                close();
              }
            }
          }}
        />
        <kbd>Ctrl K</kbd>
      </label>
      {open && (
        <div className="search-popover" aria-label="搜索结果">
          <div className="search-caption">
            {query ? '搜索结果' : '常用功能'}
            <button className="icon-btn" aria-label="关闭搜索" onClick={close}>
              <X size={15} />
            </button>
          </div>
          {matched.map((h) => (
            <button
              key={h.id}
              onClick={() => {
                onHero(h);
                close();
              }}
            >
              <Portrait hero={h} />
              <span>
                {h.name}
                <small>{h.roles.join(' / ')}</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {tasks.map((t) => (
            <button
              key={t.label}
              onClick={() => {
                onTask(t);
                close();
              }}
            >
              <Search size={17} />
              <span>
                {t.label}
                <small>{t.description}</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {!matched.length && !tasks.length && <p>没有匹配项。可试试“皮肤”“战力”或英雄名字。</p>}
        </div>
      )}
    </div>
  );
}
