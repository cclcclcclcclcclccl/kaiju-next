import { useEffect, useState } from 'react';
import { Save, Download, Upload, Plus, Trash2 } from 'lucide-react';
import { heroes, heroById } from '../catalog.ts';
import { Portrait, Modal } from '../ui.tsx';
import { profileSchema, emptyHabits, emptyHeroMetric } from './model.ts';
import { MetricFields, HabitFields } from './ProfileFields.tsx';
import ScreenshotImport from './ScreenshotImport.tsx';
import type { Profile } from './model.ts';
import { mastery, estimatePower } from './analytics.ts';
import { usePro } from './context.tsx';
import { api, download } from '../../api.ts';
export default function ProfilePage({ focusHeroId }: { focusHeroId?: number }) {
  const { data, refresh } = usePro();
  const [profile, setProfile] = useState<Profile>(data.profile),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [calc, setCalc] = useState(false);
  const [formula, setFormula] = useState({
    base: 5000,
    peakScore: 1800,
    threshold: 1200,
    step: 20,
    stepPercent: 1,
    challengePercent: 0,
    activityPercent: 100,
  });
  useEffect(() => setProfile(data.profile), [data.profile]);
  useEffect(() => {
    if (focusHeroId)
      setProfile((p) =>
        p.heroes.some((h) => h.heroId === focusHeroId)
          ? p
          : { ...p, heroes: [...p.heroes, emptyHeroMetric(focusHeroId)] },
      );
  }, [focusHeroId]);
  useEffect(() => {
    if (!focusHeroId) return;
    const timer = setTimeout(
      () =>
        document
          .querySelector('.focused-record')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      150,
    );
    return () => clearTimeout(timer);
  }, [focusHeroId]);
  const edit = (i: number, key: string, value: string | number) =>
    setProfile((p) => ({
      ...p,
      heroes: p.heroes.map((h, j) => (j === i ? { ...h, [key]: value } : h)),
    }));
  const save = async () => {
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const d = profileSchema.parse(profile);
      await api('/pro/profile-save', { expected: data.profile, profile: d });
      await refresh();
      setSuccess('档案已保存，BP 会使用这些记录评估你的个人发挥。');
    } catch (e) {
      setError(
        'issues' in (e as object)
          ? (e as { issues: { message: string }[] }).issues.map((x) => x.message).join('；')
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    const h = heroes.find((h) => !profile.heroes.some((m) => m.heroId === h.id));
    if (h)
      setProfile((p) => ({
        ...p,
        heroes: [...p.heroes, emptyHeroMetric(h.id)],
      }));
  };
  let estimate: { peakPercent: number; total: number } | null = null;
  try {
    estimate = estimatePower(formula);
  } catch {}
  return (
    <fieldset className="profile-workspace" disabled={busy} aria-label="玩家档案编辑区">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PLAYER PROFILE / YOUR REAL COMFORT ZONE</p>
          <h1>几张截图，认识你的英雄池。</h1>
          <p>从常玩的英雄开始。识别、核对、保存，不必先填一整张表。</p>
        </div>
        <button className="btn primary" disabled={busy} onClick={save}>
          <Save size={16} />
          {busy ? '保存中…' : '保存玩家档案'}
        </button>
      </div>
      <div className="pro-notice">
        优先上传截图建立档案；手动补录与文件导入在下方折叠区。游戏账号自动同步尚未接通，核对后的记录直接用于英雄池、推荐、BP
        和体系适配。
      </div>
      <div className="detail-actions">
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => download('开局-当前档案草稿.json', JSON.stringify(profile, null, 2))}
        >
          导出当前档案草稿
        </button>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            setSuccess('');
            try {
              await refresh();
              setSuccess('已用保存版本替换当前草稿。');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          读取已保存版本（替换当前草稿）
        </button>
      </div>
      <ScreenshotImport
        profile={profile}
        expectedProfile={data.profile}
        onSaved={refresh}
        onBusy={setBusy}
      />
      {data.profile.heroes.length > 0 && (
        <section className="surface profile-overview">
          <div className="section-title">
            <h2>已记录 {data.profile.heroes.length} 位英雄</h2>
            <span className="outline-tag">截图与手动记录共同使用</span>
          </div>
          <div className="profile-summary-grid">
            {data.profile.heroes.map((h) => (
              <article key={h.heroId}>
                <Portrait hero={heroById(h.heroId)} />
                <div>
                  <strong>{heroById(h.heroId)?.name}</strong>
                  <p>
                    {h.games} 场 · 胜率 {h.winRate === undefined ? '未记录' : h.winRate + '%'} ·
                    战力 {h.power || '未记录'}
                  </p>
                  <small>
                    准备度 {mastery(h.heroId, [], data.profile).score} / 100 · {h.observedOn} ·{' '}
                    {h.dataSource === 'screenshot'
                      ? '截图核对'
                      : h.dataSource === 'file'
                        ? '文件导入'
                        : '手动记录'}
                  </small>
                </div>
              </article>
            ))}
          </div>
          <p className="data-caption">
            准备度结合记录量、近期表现与记录时效，是备战参考，不是游戏官方评级。修改记录可展开下方“手动补录”。
          </p>
        </section>
      )}
      <details className="manual-profile" open={!!focusHeroId}>
        <summary>手动补录 / 打法偏好 / 导入导出（可选）</summary>
        <div className="surface pro-form">
          <label>
            档案名称
            <input
              value={profile.name}
              maxLength={24}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </label>
          <label>
            赛季 / 版本
            <input
              value={profile.season}
              maxLength={40}
              placeholder="如你游戏内显示的赛季"
              onChange={(e) => setProfile({ ...profile, season: e.target.value })}
            />
          </label>
          <label>
            当前巅峰分
            <input
              type="number"
              min={0}
              max={5000}
              value={profile.peakScore}
              onChange={(e) => setProfile({ ...profile, peakScore: Number(e.target.value) })}
            />
          </label>
          <label className="check-control">
            <input
              type="checkbox"
              checked={profile.sharePool}
              onChange={(e) => setProfile({ ...profile, sharePool: e.target.checked })}
            />
            向已接受的好友展示英雄池及本页记录
          </label>
          {(
            [
              ['seasonPeakScore', '本赛季最高巅峰分', 5000],
              ['peakEnergy', '巅峰能量', 10000],
              ['peakCoefficient', '账号巅峰加成 %', 500],
              ['challengeCoefficient', '账号挑战赛加成 %', 500],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={0}
                max={max}
                step="0.01"
                placeholder="未记录"
                value={profile[key] ?? ''}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    [key]: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="data-caption">
          巅峰能量是保护与进度背景，不直接当作操作水平加分。账号巅峰分保留段位背景；英雄系数优先于账号系数，历史最高战力不替代当前战力。
        </p>
        <HabitFields
          value={profile.habits ?? emptyHabits()}
          onChange={(habits) => setProfile({ ...profile, habits })}
        />
        <div className="pro-actions">
          <button className="btn secondary" onClick={add}>
            <Plus size={16} />
            添加英雄记录
          </button>
          <button
            className="btn secondary"
            onClick={() => download('开局-我的英雄记录.json', JSON.stringify(profile, null, 2))}
          >
            <Download size={16} />
            导出档案
          </button>
          <label className="btn secondary">
            <Upload size={16} />
            导入档案
            <input
              aria-label="导入玩家档案"
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 128 * 1024) throw new Error('文件过大');
                  const imported = profileSchema.parse(JSON.parse(await f.text()));
                  setProfile({
                    ...imported,
                    heroes: imported.heroes.map((h) => ({ ...h, dataSource: 'file' })),
                  });
                  setSuccess('已载入预览，请核对后保存。');
                  setError('');
                } catch (x) {
                  setError((x as Error).message);
                }
              }}
            />
          </label>
          <button
            className="text-btn"
            onClick={() => {
              setFormula((v) => ({ ...v, peakScore: profile.peakScore }));
              setCalc(true);
            }}
          >
            战力系数推演 ↗
          </button>
        </div>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="pro-notice" role="status">
            {success}
          </p>
        )}
        <div className="metric-editor">
          {profile.heroes.map((h, i) => {
            const m = mastery(h.heroId, [], profile);
            return (
              <section
                className={'surface ' + (h.heroId === focusHeroId ? 'focused-record' : '')}
                key={i}
              >
                <div className="section-title">
                  <div className="hero-row">
                    <Portrait hero={heroById(h.heroId)} />
                    <select
                      aria-label={'记录英雄' + (i + 1)}
                      value={h.heroId}
                      onChange={(e) => edit(i, 'heroId', Number(e.target.value))}
                    >
                      {heroes.map((x) => (
                        <option
                          key={x.id}
                          value={x.id}
                          disabled={profile.heroes.some(
                            (other, j) => j !== i && other.heroId === x.id,
                          )}
                        >
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span>
                    个人准备度 {m.score} · {m.confidence}
                  </span>
                  <button
                    className="icon-btn"
                    aria-label={'删除' + heroById(h.heroId)?.name + '记录'}
                    onClick={() =>
                      setProfile({ ...profile, heroes: profile.heroes.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <MetricFields
                  record={h}
                  index={i}
                  onChange={(next) =>
                    setProfile((p) => ({
                      ...p,
                      heroes: p.heroes.map((old, j) => (j === i ? next : old)),
                    }))
                  }
                />
                <details className="score-explanation">
                  <summary>
                    准备度 {m.score} 的计算依据 · {m.confidence}
                  </summary>
                  <ul>
                    {m.parts.map((p) => (
                      <li key={p.label}>
                        <strong>
                          {p.label} · 权重 {(p.weight * 100).toFixed(0)}%
                        </strong>
                        ：{p.evidence}
                      </li>
                    ))}
                  </ul>
                  <p>
                    记录可信权重 {(m.trust * 100).toFixed(0)}%，有实战样本时其余回退到中立基线
                    50；无样本时仅参考自报标签或未知基线。准备度不是胜率。
                  </p>
                </details>
                <label className="field">
                  数据依据
                  <input
                    value={h.evidence}
                    maxLength={300}
                    placeholder="例如：游戏内英雄战力页，近期 20 场手动汇总"
                    onChange={(e) => edit(i, 'evidence', e.target.value)}
                  />
                </label>
              </section>
            );
          })}
        </div>
        {!profile.heroes.length && (
          <div className="empty">
            <h3>从你常玩的三位英雄开始</h3>
            <p>数据由你核对，不需要游戏账号密码。添加记录后会用于个性化 BP。</p>
          </div>
        )}
        <p className="data-caption">
          个人准备度是项目估计，不能当成官方熟练度或胜率。近期胜负做小样本平滑，场次衡量经验，战力只占部分权重；跨英雄的战力本身并不严格可比。巅峰分只保留为背景，不凭它伪造战力变化。
        </p>
      </details>
      {calc && (
        <Modal title="战力系数推演 · 不修改实际记录" onClose={() => setCalc(false)} wide>
          <p className="dialog-lead">
            这是可配置的假设计算器。请从当前赛季游戏说明核对公式和各项系数；默认值是演示参数，未确认适用于当前赛季。实际战力还可能受表现上限、活跃系数及其他规则影响。
          </p>
          <div className="pro-form">
            {[
              ['base', '基础分'],
              ['peakScore', '目标巅峰分'],
              ['threshold', '加成起点'],
              ['step', '每档分数'],
              ['stepPercent', '每档加成 %'],
              ['challengePercent', '挑战赛加成 %'],
              ['activityPercent', '活跃系数 %'],
            ].map(([k, l]) => (
              <label key={k}>
                {l}
                <input
                  type="number"
                  min={0}
                  value={formula[k as keyof typeof formula]}
                  onChange={(e) => setFormula({ ...formula, [k]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
          <div className="metric-strip">
            <div>
              <strong>{estimate?.peakPercent ?? '—'}%</strong>
              <span>按输入参数推演的巅峰加成</span>
            </div>
            <div>
              <strong>{estimate?.total ?? '—'}</strong>
              <span>假设公式下的估算战力</span>
            </div>
          </div>
          <p className="data-caption">
            估算 = 基础分 × (1 + 巅峰加成 + 挑战赛加成) ×
            活跃系数。未获得真实账号接口前，不执行“自动更新真实战力”。
          </p>
        </Modal>
      )}
    </fieldset>
  );
}
