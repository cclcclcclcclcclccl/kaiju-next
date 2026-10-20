import { useState } from 'react';
import { heroes } from '../catalog.ts';
import { ROLES } from '../model.ts';
import { tianyuanAnalysisSchema } from './tianyuan.ts';
import { HeroIdentity } from './SourceMedia.tsx';
import { SourceTable } from './SourceWidgets.tsx';
const normalized = (s: string) => s.replaceAll('（', '(').replaceAll('）', ')').replace(/\s/g, '');
export default function RelationExplorer({ data }: { data: unknown }) {
  const [role, setRole] = useState('全部'),
    [minimum, setMinimum] = useState(0),
    [sort, setSort] = useState('sample');
  const parsed = tianyuanAnalysisSchema.parse(data);
  return (
    <section className="relation-explorer">
      <p className="pro-notice">
        来源页面标注近 30
        天，接口不提供历史日期切换。分路筛选筛的是关联英雄的目录定位，不是重新统计“本英雄走该分路”的对局。指数沿用来源定义，不当作个人胜率或直接写入
        BP 评分。
      </p>
      <div className="pro-toolbar">
        <label>
          关联英雄分路
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {['全部', ...ROLES].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          最低样本场次
          <select value={minimum} onChange={(e) => setMinimum(Number(e.target.value))}>
            {[0, 100, 500, 1000, 5000].map((n) => (
              <option key={n} value={n}>
                {n ? n + ' 场' : '不限'}
              </option>
            ))}
          </select>
        </label>
        <label>
          关联排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="sample">样本场次优先</option>
            <option value="index">指数绝对值优先</option>
          </select>
        </label>
      </div>
      {(
        [
          ['counters', '来源有利对位'],
          ['counteredBy', '来源不利对位'],
          ['goodSynergies', '来源正向组合'],
          ['badSynergies', '来源负向组合'],
        ] as const
      ).map(([key, title]) => {
        const rows = parsed[key].map((r) => ({
          ...r,
          index: r.advantageIndex ?? r.synergyIndex ?? null,
          roles: heroes.find((h) => normalized(h.name) === normalized(r.heroName))?.roles ?? [],
        }));
        const filtered = rows
          .filter((r) => r.totalMatches >= minimum && (role === '全部' || r.roles.includes(role)))
          .sort((a, b) =>
            sort === 'sample'
              ? b.totalMatches - a.totalMatches
              : Math.abs(b.index ?? 0) - Math.abs(a.index ?? 0),
          );
        return (
          <div key={key}>
            <p className="data-caption">
              {title}：显示 {filtered.length} / {rows.length} 条
              {role !== '全部'
                ? `；${rows.filter((r) => !r.roles.length).length} 条分路未知未纳入本筛选`
                : ''}
            </p>
            <SourceTable
              key={key + role + minimum + sort}
              title={title}
              rows={filtered}
              columns={[
                {
                  key: 'heroName',
                  label: '英雄',
                  render: (r) => <HeroIdentity name={r.heroName} />,
                },
                { key: 'totalMatches', label: '样本场次' },
                { key: 'index', label: '来源指数' },
              ]}
            />
          </div>
        );
      })}
    </section>
  );
}
