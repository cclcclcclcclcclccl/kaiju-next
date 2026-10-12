import { useState } from 'react';
import { Timer, Route, Save } from 'lucide-react';
import type { Hero } from '../model.ts';
import { usePro } from './context.tsx';
import { api } from '../../api.ts';
const paths = {
  blue: [
    '蓝区增益野怪',
    '蓝区近侧小野',
    '蓝区另一组小野',
    '转至红区增益野怪',
    '红区两组小野',
    '看邻近兵线与河道信息',
  ],
  red: [
    '红区增益野怪',
    '红区近侧小野',
    '红区另一组小野',
    '转至蓝区增益野怪',
    '蓝区两组小野',
    '看邻近兵线与河道信息',
  ],
};
export default function Jungle({ hero }: { hero: Hero }) {
  const { data, refresh } = usePro();
  const [route, setRoute] = useState<'red' | 'blue'>('blue'),
    [seconds, setSeconds] = useState(0),
    [patch, setPatch] = useState(data.profile.season),
    [conditions, setConditions] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const runs = (data.runs ?? []).filter(
    (r) =>
      r.heroId === hero.id &&
      r.route === route &&
      r.patch === patch.trim() &&
      r.conditions === conditions.trim(),
  );
  const times = runs.map((r) => r.seconds).sort((a, b) => a - b),
    median = times.length
      ? times.length % 2
        ? times[Math.floor(times.length / 2)]
        : (times[times.length / 2 - 1] + times[times.length / 2]) / 2
      : null;
  const fmt = (s: number) =>
    Math.floor(Math.round(s) / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');
  const save = async () => {
    setBusy(true);
    try {
      await api('/pro/jungle', { heroId: hero.id, route, seconds, patch, conditions });
      await refresh();
      setMessage('实测出野时间已保存');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="jungle-section">
      <div className="section-title">
        <h3>
          <Route size={18} />
          首轮刷野与出野校准
        </h3>
        <select
          aria-label="刷野起点"
          value={route}
          onChange={(e) => setRoute(e.target.value as 'red' | 'blue')}
        >
          <option value="blue">蓝开顺刷</option>
          <option value="red">红开顺刷</option>
        </select>
      </div>
      <div className="route-steps">
        {paths[route].map((s, i) => (
          <div key={i}>
            <b>{i + 1}</b>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <p className="muted">
        这是首轮练习的顺刷模板。根据己方保护能力、对方入侵信息及希望靠近的边路调整起点；遇到入侵时先判断能否守住，再考虑换区，不能为了完成路线硬刷。营地布局以当前地图为准。
      </p>
      <div className="metric-strip">
        <div>
          <strong>{median === null ? '待实测' : fmt(median)}</strong>
          <span>同英雄、路线、版本与条件的出野中位时间</span>
        </div>
        <div>
          <strong>{times.length}</strong>
          <span>{times.length < 3 ? '建议至少记录 3 次同条件练习' : '已积累的实际样本'}</span>
        </div>
      </div>
      <div className="pro-form">
        <label>
          版本 / 赛季
          <input value={patch} maxLength={40} onChange={(e) => setPatch(e.target.value)} />
        </label>
        <label>
          出野时游戏计时（秒）
          <input
            type="number"
            min={30}
            max={600}
            value={seconds || ''}
            onChange={(e) => setSeconds(Number(e.target.value))}
          />
        </label>
        <label>
          实测条件
          <input
            value={conditions}
            maxLength={300}
            placeholder="铭文、惩击、是否被干扰、路线变化"
            onChange={(e) => setConditions(e.target.value)}
          />
        </label>
      </div>
      <button
        className="btn secondary"
        disabled={busy || !patch || seconds < 30 || !conditions}
        onClick={save}
      >
        <Save size={15} />
        保存一次真实测量
      </button>
      {message && (
        <p role="status" className="data-caption">
          {message}
        </p>
      )}
      <p className="data-caption">
        没有经过当前版本实测时，不编造“这个英雄一定几分几秒出野”。中位时间是你自己的练习基准，不是全服最优速度；不同配置与受干扰样本不应直接比较。
      </p>
    </section>
  );
}
