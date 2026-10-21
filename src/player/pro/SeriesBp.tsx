import { useEffect, useState } from 'react';
import type { Draft } from '../model.ts';
import { heroById } from '../catalog.ts';
import { download } from '../../api.ts';
import BpRounds from './BpRounds.tsx';
import SeriesEditor from './SeriesEditor.tsx';
import SeriesSave from './SeriesSave.tsx';
import {
  parseSeries,
  seriesScore,
  usedByTeam,
  seedSeriesGame,
  finishSeriesGame,
  nextSeriesGame,
} from './seriesBp.ts';
import type { Series } from './seriesBp.ts';
import { roundsFor } from './bpSession.ts';
const KEY = 'kaiju.bp.series.v1';
export default function SeriesBp({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return { value: raw ? parseSeries(JSON.parse(raw)) : null, error: '' };
    } catch {
      return { value: null, error: '旧系列赛记录未通过校验，未覆盖原记录；可重新开始。' };
    }
  });
  const [series, setSeries] = useState<Series | null>(initial.value),
    [bestOf, setBestOf] = useState<Series['bestOf']>(initial.value?.bestOf ?? 5),
    [error, setError] = useState(initial.error),
    [epoch, setEpoch] = useState(0);
  const [decidingRule, setDecidingRule] = useState<'global' | 'reset'>(
    initial.value?.decidingRule ?? 'global',
  );
  const [editing, setEditing] = useState<number | null>(null);
  useEffect(() => {
    if (series)
      try {
        localStorage.setItem(KEY, JSON.stringify(series));
      } catch {
        setError('系列赛保存失败，请导出备份。');
      }
  }, [series]);
  const last = series?.games.at(-1),
    score = series ? seriesScore(series) : [0, 0],
    ended = score.some((s) => s > (series?.bestOf ?? bestOf) / 2),
    used = series ? usedByTeam(series) : [[], []];
  const act = (fn: () => Series) => {
    try {
      setSeries(fn());
      setError('');
      setEpoch((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="series-bp surface">
      <h2>系列赛 · 全局 BP</h2>
      <p>
        按真实队伍累计已用英雄，交换红蓝后限制跟随队伍。可选择最后一局解除跨局限制；仍使用公开的分阶段选禁，不等同于赛事盲选巅峰对决。比分由你登记。
      </p>
      <div className="pro-toolbar">
        <label>
          新系列赛赛制
          <select
            value={bestOf}

            onChange={(e) => setBestOf(Number(e.target.value) as Series['bestOf'])}
          >
            {[3, 5, 7, 9].map((n) => (
              <option key={n} value={n}>
                BO{n}
              </option>
            ))}
          </select>
        </label>
        <label>
          新系列赛决胜局规则
          <select
            value={decidingRule}
            onChange={(e) => setDecidingRule(e.target.value as typeof decidingRule)}
          >
            <option value="global">全程全局限制</option>
            <option value="reset">打满最后一局时重置英雄限制</option>
          </select>
        </label>
        <button
          className="btn primary"
          onClick={() =>
            act(() => {
              if (series)
                localStorage.setItem('kaiju.bp.series.before-edit.v1', JSON.stringify(series));
              setEditing(null);
              const s: Series = {
                version: 1,
                bestOf,
                decidingRule,
                names: ['队伍 1', '队伍 2'],
                games: [],
              };
              s.games.push({ blue: 0, session: seedSeriesGame(s, 0) });
              return s;
            })
          }
        >
          开始新系列赛
        </button>
        {series && (
          <button
            className="text-btn"
            onClick={() => download('自在弈境-系列赛BP.json', JSON.stringify(series, null, 2))}
          >
            导出系列赛
          </button>
        )}
        <button
          className="text-btn"
          onClick={() =>
            act(() => {
              const raw = localStorage.getItem('kaiju.bp.series.before-edit.v1');
              if (!raw) throw Error('尚无修改前备份');
              const saved = parseSeries(JSON.parse(raw));
              setEditing(null);
              return saved;
            })
          }
        >
          恢复修改前备份
        </button>
        <label>
          恢复系列赛
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1000000) {
                setError('文件过大');
                return;
              }
              try {
                const s = parseSeries(JSON.parse(await f.text()));
                setBestOf(s.bestOf);
                setDecidingRule(s.decidingRule ?? 'global');
                setEditing(null);
                act(() => s);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </label>
      </div>
      <SeriesSave
        series={series}
        onLoad={(s) => {
          act(() => s);
          setEditing(null);
          setBestOf(s.bestOf);
          setDecidingRule(s.decidingRule ?? 'global');
        }}
      />
      {series && editing !== null && (
        <SeriesEditor
          key={editing}
          series={series}
          index={editing}
          draft={draft}
          onApply={(s) => {
            act(() => s);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {series && last && editing === null && (
        <>
          <div className="plus-metrics">
            {series.names.map((n, i) => (
              <article key={i}>
                <label>
                  队伍 {i + 1} 名称
                  <input
                    value={n}
                    maxLength={40}
                    onChange={(e) => {
                      if (e.target.value.trim())
                        setSeries((s) =>
                          s
                            ? {
                                ...s,
                                names: s.names.map((v, j) => (j === i ? e.target.value : v)) as [
                                  string,
                                  string,
                                ],
                              }
                            : s,
                        );
                    }}
                  />
                </label>
                <strong>{score[i]}</strong>
                <small>
                  已用英雄：{used[i].map((id) => heroById(id)?.name).join('、') || '暂无'}
                </small>
              </article>
            ))}
          </div>
          <h3>
            第 {series.games.length} 局 · 蓝方 {series.names[last.blue]} / 红方{' '}
            {series.names[1 - last.blue]}
          </h3>
          <p className="data-caption">
            本系列赛：BO{series.bestOf} ·{' '}
            {series.decidingRule === 'reset'
              ? '打满最后一局重置跨局限制（仍有禁用）'
              : '全程全局限制'}
          </p>
          {!last.session.moves.length && (
            <button
              className="btn secondary"
              onClick={() =>
                act(() => {
                  const blue = (1 - last.blue) as 0 | 1;
                  return {
                    ...series,
                    games: series.games.map((g, i) =>
                      i === series.games.length - 1
                        ? {
                            blue,
                            session: seedSeriesGame(
                              { ...series, games: series.games.slice(0, -1) },
                              blue,
                            ),
                          }
                        : g,
                    ),
                  };
                })
              }
            >
              交换本局红蓝队伍
            </button>
          )}
          {last.winner === undefined ? (
            <>
              <BpRounds
                key={epoch + ':' + series.games.length}
                draft={draft}
                onChange={onChange}
                series={{
                  seed: last.session,
                  onSession: (session) =>
                    setSeries((s) =>
                      s
                        ? {
                            ...s,
                            games: s.games.map((g, i) =>
                              i === s.games.length - 1 ? { ...g, session } : g,
                            ),
                          }
                        : s,
                    ),
                }}
              />
              {last.session.moves.length === roundsFor(last.session.format).length && (
                <div className="pro-actions">
                  {series.names.map((name, i) => (
                    <button
                      className="btn secondary"
                      key={i}
                      onClick={() => act(() => finishSeriesGame(series, i as 0 | 1))}
                    >
                      记录 {name} 本局获胜
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p>
                本局已记录：{series.names[last.winner]} 获胜。
                {ended ? '系列赛已结束。' : '下一局可继续使用双方尚未使用的英雄。'}
              </p>
              {!ended && (
                <button className="btn primary" onClick={() => act(() => nextSeriesGame(series))}>
                  进入下一局
                </button>
              )}
            </>
          )}
          <details className="source-proof">
            <summary>查看各局选禁记录</summary>
            {series.games.map((g, i) => (
              <article key={i}>
                <h4>
                  第 {i + 1} 局 · 蓝方 {series.names[g.blue]} ·{' '}
                  {g.winner === undefined ? '进行中' : series.names[g.winner] + '胜'}
                </h4>
                <p>
                  {g.session.moves
                    .map(
                      (m, j) =>
                        `${j + 1}.${roundsFor(g.session.format)[j].kind === 'ban' ? '禁' : '选'}${heroById(m.heroId)?.name}`,
                    )
                    .join(' / ')}
                </p>
                <button className="text-btn" onClick={() => setEditing(i)}>
                  修改第 {i + 1} 局
                </button>
              </article>
            ))}
          </details>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
