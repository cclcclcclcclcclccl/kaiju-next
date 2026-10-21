import { useState } from 'react';
import type { Draft } from '../model.ts';
import type { Series } from './seriesBp.ts';
import { reviseSeriesGame } from './seriesBp.ts';
import BpRounds from './BpRounds.tsx';
import { download } from '../../api.ts';

export default function SeriesEditor({
  series,
  index,
  draft,
  onApply,
  onClose,
}: {
  series: Series;
  index: number;
  draft: Draft;
  onApply: (s: Series) => void;
  onClose: () => void;
}) {
  const [game, setGame] = useState(series.games[index]);
  const [error, setError] = useState('');
  const save = (branch: boolean) => {
    try {
      const next = reviseSeriesGame(series, index, game, branch);
      // Retain the entire original, including downstream results, before replacing it.
      localStorage.setItem('kaiju.bp.series.before-edit.v1', JSON.stringify(series));
      if (branch) download('自在弈境-修改前完整系列赛.json', JSON.stringify(series, null, 2));
      onApply(next);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="surface series-editor" aria-label="修改历史局">
      <h3>修改第 {index + 1} 局</h3>
      <p>
        撤回后重新选禁，或重新开始本局。保存时逐局重算已用英雄限制；后续局冲突会拒绝保存。取消不改变原记录。
      </p>
      <BpRounds
        draft={draft}
        onChange={() => {}}
        series={{ seed: game.session, onSession: (session) => setGame((g) => ({ ...g, session })) }}
      />
      <label>
        修改本局结果
        <select
          value={game.winner ?? ''}
          onChange={(e) =>
            setGame((g) => ({
              ...g,
              winner: e.target.value === '' ? undefined : (Number(e.target.value) as 0 | 1),
            }))
          }
        >
          <option value="">尚未结束</option>
          {series.names.map((n, i) => (
            <option key={i} value={i}>
              {n} 获胜
            </option>
          ))}
        </select>
      </label>
      <div className="pro-actions">
        <button className="btn primary" onClick={() => save(false)}>
          校验并保留后续局
        </button>
        {index < series.games.length - 1 && (
          <button className="btn secondary" onClick={() => save(true)}>
            备份原系列赛并从本局重新续赛
          </button>
        )}
        <button className="text-btn" onClick={onClose}>
          取消修改
        </button>
      </div>
      {index < series.games.length - 1 && (
        <p className="data-caption">
          重新续赛会移除当前记录的第 {index + 2} 局及以后；完整原记录会先保存到本机备份并导出 JSON。
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
