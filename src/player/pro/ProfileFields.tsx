import type { HeroMetric, Habits } from './model.ts';
import { PLAY_STYLES, FOCUS_AREAS } from './model.ts';
import { ROLES } from '../model.ts';

export const metricFields: { key: keyof HeroMetric; label: string; max: number; step?: string }[] =
  [
    { key: 'power', label: '游戏内战力', max: 100000 },
    { key: 'historicalPeakPower', label: '历史最高战力', max: 100000 },
    { key: 'games', label: '总场次', max: 100000 },
    { key: 'wins', label: '总胜场', max: 100000 },
    { key: 'winRate', label: '总胜率 %', max: 100, step: '0.01' },
    { key: 'averageRating', label: '平均评分', max: 16, step: '0.1' },
    { key: 'seasonGames', label: '本赛季场次', max: 100000 },
    { key: 'seasonWins', label: '本赛季胜场', max: 100000 },
    { key: 'seasonWinRate', label: '本赛季胜率 %', max: 100, step: '0.01' },
    { key: 'recentGames', label: '近期场次', max: 1000 },
    { key: 'recentWins', label: '近期胜场', max: 1000 },
    { key: 'recentWinRate', label: '近期胜率 %', max: 100, step: '0.01' },
    { key: 'recentRating', label: '近期平均评分', max: 16, step: '0.1' },
    { key: 'proficiencyPoints', label: '游戏内熟练度分', max: 10000000 },
    { key: 'performanceScore', label: '表现分合计', max: 100000, step: '0.01' },
    { key: 'rankPerformanceScore', label: '排位表现分', max: 100000, step: '0.01' },
    { key: 'peakPerformanceScore', label: '巅峰表现分', max: 100000, step: '0.01' },
    { key: 'peakCoefficient', label: '英雄巅峰加成 %', max: 500, step: '0.01' },
    { key: 'challengeCoefficient', label: '英雄挑战赛加成 %', max: 500, step: '0.01' },
  ];
export function MetricFields({
  record,
  index,
  onChange,
}: {
  record: HeroMetric;
  index: number;
  onChange: (next: HeroMetric) => void;
}) {
  const edit = (key: keyof HeroMetric, value: number | undefined) => {
    const next = { ...record, [key]: value, dataSource: 'manual' as const };
    const pairs = [
      ['wins', 'winRate'],
      ['recentWins', 'recentWinRate'],
      ['seasonWins', 'seasonWinRate'],
    ] as const;
    for (const [wins, rate] of pairs) {
      if (key === wins) next[rate] = undefined;
      if (key === rate) next[wins] = undefined;
    }
    onChange(next);
  };
  return (
    <>
      <p className="data-caption">
        胜场和胜率可以任选一种填写；缺失的评分、历史战力与系数留空。系数填写游戏显示的加成百分数，例如
        35 表示 +35%。
      </p>
      <div className="pro-form metric-fields">
        {metricFields.map(({ key, label, max, step }) => (
          <label key={key}>
            {label}
            <input
              aria-label={label + (index + 1)}
              type="number"
              min={0}
              max={max}
              step={step ?? '1'}
              placeholder="未记录"
              value={(record[key] as number) ?? ''}
              onChange={(e) =>
                edit(
                  key,
                  e.target.value === ''
                    ? ['games', 'power', 'recentGames'].includes(key)
                      ? 0
                      : undefined
                    : Number(e.target.value),
                )
              }
            />
          </label>
        ))}
        <label>
          核对日期
          <input
            aria-label={'核对日期' + (index + 1)}
            type="date"
            value={record.observedOn}
            onChange={(e) => onChange({ ...record, observedOn: e.target.value })}
          />
        </label>
      </div>
      <label className="check-control">
        <input
          type="checkbox"
          checked={record.inPool !== false}
          onChange={(e) => onChange({ ...record, inPool: e.target.checked })}
        />
        将这位英雄纳入我的备战英雄池
      </label>
    </>
  );
}

export function HabitFields({ value, onChange }: { value: Habits; onChange: (v: Habits) => void }) {
  const toggle = <K extends 'roles' | 'styles' | 'focus'>(key: K, item: Habits[K][number]) => {
    const list = value[key] as string[];
    onChange({
      ...value,
      [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item],
    });
  };
  return (
    <section className="surface habit-editor">
      <div className="section-title">
        <h2>我的打法与训练目标</h2>
        <span className="muted">用于个性化英雄、打法和体系推荐</span>
      </div>
      <fieldset>
        <legend>偏好分路</legend>
        <div className="habit-options">
          {ROLES.map((x) => (
            <label key={x} className="check-control">
              <input
                type="checkbox"
                checked={value.roles.includes(x)}
                onChange={() => toggle('roles', x)}
              />
              {x}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>习惯的打法</legend>
        <div className="habit-options">
          {PLAY_STYLES.map((x) => (
            <label key={x} className="check-control">
              <input
                type="checkbox"
                checked={value.styles.includes(x)}
                onChange={() => toggle('styles', x)}
              />
              {x}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="pro-form">
        <label>
          操作接受度
          <select
            value={value.mechanics}
            onChange={(e) => onChange({ ...value, mechanics: Number(e.target.value) })}
          >
            {[
              '偏好简单稳定',
              '愿意练基础连招',
              '接受中等操作',
              '愿意反复练复杂机制',
              '偏好高操作上限',
            ].map((x, i) => (
              <option key={x} value={i + 1}>
                {i + 1} · {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          决策倾向
          <select
            value={value.risk}
            onChange={(e) => onChange({ ...value, risk: e.target.value as Habits['risk'] })}
          >
            {['稳健', '均衡', '主动'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          当前目标
          <select
            value={value.goal}
            onChange={(e) => onChange({ ...value, goal: e.target.value as Habits['goal'] })}
          >
            {['稳定上分', '拓展英雄池', '五排配合'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          每周可练场次
          <input
            type="number"
            min={0}
            max={300}
            value={value.weeklyGames}
            onChange={(e) => onChange({ ...value, weeklyGames: Number(e.target.value) })}
          />
        </label>
      </div>
      <fieldset>
        <legend>最想改进的地方</legend>
        <div className="habit-options">
          {FOCUS_AREAS.map((x) => (
            <label key={x} className="check-control">
              <input
                type="checkbox"
                checked={value.focus.includes(x)}
                onChange={() => toggle('focus', x)}
              />
              {x}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        补充自己的思路
        <textarea
          maxLength={500}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="例如：经常支援太早掉线，想学习先清线再转线。补充文字随训练卡保留；推荐主要依据上方结构化选择。"
        />
      </label>
    </section>
  );
}
