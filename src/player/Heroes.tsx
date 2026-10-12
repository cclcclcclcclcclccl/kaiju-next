import { useMemo, useState } from 'react';
import { Search, ArrowUpRight, Plus, Check, BookOpen, Star } from 'lucide-react';
import { heroes, dataMeta, heroById } from './catalog.ts';
import { ROLES, levelNames } from './model.ts';
import type { Hero, Pool } from './model.ts';
import { notes, traitNames } from './tactics.ts';
import { Modal, Portrait, Empty, SourceLink } from './ui.tsx';

export function HeroDetail({
  hero,
  pool,
  onPool,
  onClose,
  busy,
}: {
  hero: Hero;
  pool: Pool;
  onPool: (pool: Pool) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const entry = pool.find((p) => p.heroId === hero.id),
    note = notes[hero.name];
  const [tab, setTab] = useState(0);
  return (
    <Modal title={hero.name + ' · ' + hero.title} onClose={onClose} wide>
      <div
        className="detail-banner"
        style={{
          backgroundImage:
            'linear-gradient(90deg,#111a28 10%,transparent),url("' + hero.cover + '")',
        }}
      >
        <Portrait hero={hero} />
        <div>
          <span className="tag">{hero.roles.join(' / ')}</span>
          <h3>{hero.name}</h3>
          <p>{hero.classes.join(' · ')}</p>
        </div>
      </div>
      <div className="detail-actions">
        <button
          className={'btn ' + (entry ? 'secondary' : 'primary')}
          disabled={busy}
          onClick={() =>
            onPool(
              entry
                ? pool.filter((p) => p.heroId !== hero.id)
                : [...pool, { heroId: hero.id, level: 'learning' }],
            )
          }
        >
          {entry ? <Check size={15} /> : <Plus size={15} />}{' '}
          {entry ? '已加入英雄池 · 移除' : '加入我的英雄池'}
        </button>
        {entry && (
          <select
            aria-label="英雄熟练度"
            value={entry.level}
            disabled={busy}
            onChange={(e) =>
              onPool(
                pool.map((p) =>
                  p.heroId === hero.id
                    ? { ...p, level: e.target.value as Pool[number]['level'] }
                    : p,
                ),
              )
            }
          >
            {Object.entries(levelNames).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        )}
        <SourceLink hero={hero} />
      </div>
      {note && (
        <section className="tactical-note">
          <p className="eyebrow">开局战术笔记 · 定性建议</p>
          <div className="chips">
            {note.traits.map((t) => (
              <span key={t}>{traitNames[t]}</span>
            ))}
          </div>
          <p>{note.tip}</p>
          <p className="muted">需要取舍：{note.tradeoff}</p>
          <div className="practice-tip">
            <Star size={16} />
            <span>先练这一件事：{note.drill}</span>
          </div>
        </section>
      )}
      <section className="skill-section">
        <div className="section-title">
          <h3>
            <BookOpen size={17} /> 技能资料
          </h3>
          <span>官方页面快照</span>
        </div>
        {hero.skills.length ? (
          <>
            <div className="skill-tabs">
              {hero.skills.map((s, i) => (
                <button
                  key={i}
                  aria-pressed={tab === i}
                  className={tab === i ? 'active' : ''}
                  onClick={() => setTab(i)}
                >
                  <span>{i === 0 ? '被动' : '技能 ' + i}</span>
                  {s.name}
                </button>
              ))}
            </div>
            <p className="skill-description">{hero.skills[tab]?.description}</p>
          </>
        ) : (
          <p className="muted">
            该英雄的旧版官方技能页暂不可用。可从官方资料入口查看，不补填未经核对的数值。
          </p>
        )}
        <p className="data-caption">
          获取于 {new Date(dataMeta.fetchedAt).toLocaleDateString('zh-CN')}
          。官网页面未提供统一版本号，技能数值以游戏内为准。
        </p>
      </section>
    </Modal>
  );
}
export default function Heroes({
  pool,
  onPool,
  onOpen,
  busy,
  onlyPool = false,
}: {
  pool: Pool;
  onPool: (pool: Pool) => void;
  onOpen: (h: Hero) => void;
  busy: boolean;
  onlyPool?: boolean;
}) {
  const [query, setQuery] = useState(''),
    [role, setRole] = useState('全部');
  const list = useMemo(
    () =>
      heroes.filter(
        (h) =>
          (!onlyPool || pool.some((p) => p.heroId === h.id)) &&
          (role === '全部' || h.roles.includes(role)) &&
          (!query || [h.name, h.slug, h.title].some((x) => x.includes(query.trim()))),
      ),
    [query, role, pool, onlyPool],
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{onlyPool ? 'YOUR HERO POOL' : 'HERO ATLAS / OFFICIAL CATALOG'}</p>
          <h1>{onlyPool ? '把会玩的，变成底气。' : '找到你的下一位本命。'}</h1>
          <p>
            {onlyPool
              ? '标记真实熟练度，备战建议会优先考虑你能发挥的英雄。'
              : '查定位、看技能、记下练习重点。资料来自王者荣耀官方公开目录。'}
          </p>
        </div>
        <span className="outline-tag">{onlyPool ? pool.length : heroes.length} 位英雄</span>
      </div>
      <div className="atlas-toolbar">
        <div className="filter-tabs">
          {['全部', ...ROLES].map((r) => (
            <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)}>
              {r}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="搜索英雄"
            placeholder="搜索英雄 / 拼音"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {list.length ? (
        <div className="hero-grid">
          {list.map((h) => {
            const level = pool.find((p) => p.heroId === h.id)?.level;
            return (
              <article className="hero-card" key={h.id}>
                <button
                  className="hero-art"
                  onClick={() => onOpen(h)}
                  aria-label={'查看' + h.name + '资料'}
                >
                  <img
                    src={h.cover}
                    loading="lazy"
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.opacity = '0';
                    }}
                  />
                  <span className="hero-watermark">{h.name}</span>
                  <span className="hero-card-role">{h.roles.join(' / ')}</span>
                  <span className="art-arrow">
                    <ArrowUpRight size={18} />
                  </span>
                </button>
                <div className="hero-card-info">
                  <div>
                    <button onClick={() => onOpen(h)}>{h.name}</button>
                    <p>{h.title}</p>
                  </div>
                  <button
                    className={'icon-btn ' + (level ? 'is-favorite' : '')}
                    disabled={busy}
                    aria-label={(level ? '移出英雄池' : '加入英雄池') + h.name}
                    onClick={() =>
                      onPool(
                        level
                          ? pool.filter((p) => p.heroId !== h.id)
                          : [...pool, { heroId: h.id, level: 'learning' }],
                      )
                    }
                  >
                    {level ? <Star size={18} fill="currentColor" /> : <Plus size={19} />}
                  </button>
                </div>
                {onlyPool && (
                  <div className="pool-level">
                    <span>我的熟练度</span>
                    <select
                      aria-label={h.name + '熟练度'}
                      value={level}
                      disabled={busy}
                      onChange={(e) =>
                        onPool(
                          pool.map((p) =>
                            p.heroId === h.id
                              ? { ...p, level: e.target.value as Pool[number]['level'] }
                              : p,
                          ),
                        )
                      }
                    >
                      {Object.entries(levelNames).map(([v, n]) => (
                        <option key={v} value={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={onlyPool ? '从真正会玩的英雄开始' : '没有找到这个英雄'}
          description={
            onlyPool ? '在英雄图鉴中点击加号，把常玩的英雄加入这里。' : '试着换一个名字或分路筛选。'
          }
        />
      )}
      <p className="data-caption">
        英雄目录与立绘：腾讯王者荣耀官方公开资料 · 战术笔记：本项目整理的定性建议 ·
        不代表当前版本强度排名
      </p>
    </>
  );
}
