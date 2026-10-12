import { useEffect, useState } from 'react';
import { Save, Download, Upload, Plus, Trash2 } from 'lucide-react';
import { heroes, heroById } from '../catalog.ts';
import { Portrait, Modal } from '../ui.tsx';
import { profileSchema, emptyProfile } from './model.ts';
import type { Profile } from './model.ts';
import { mastery, estimatePower } from './analytics.ts';
import { usePro } from './context.tsx';
import { api, download } from '../../api.ts';
export default function ProfilePage() {
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
      await api('/pro/profile', d);
      await refresh();
      setSuccess('档案已保存，BP 会使用这些记录评估你的个人发挥。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    const h = heroes.find((h) => !profile.heroes.some((m) => m.heroId === h.id));
    if (h)
      setProfile((p) => ({
        ...p,
        heroes: [
          ...p.heroes,
          {
            heroId: h.id,
            power: 0,
            games: 0,
            wins: 0,
            recentGames: 0,
            recentWins: 0,
            observedOn: new Date().toLocaleDateString('en-CA'),
            evidence: '',
          },
        ],
      }));
  };
  let estimate: { peakPercent: number; total: number } | null = null;
  try {
    estimate = estimatePower(formula);
  } catch {}
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PLAYER PROFILE / YOUR REAL COMFORT ZONE</p>
          <h1>记录你的实力，也保留它的来处。</h1>
          <p>战力、巅峰分和近期表现共同参考。记录越少、越旧，建议越保守。</p>
        </div>
        <button className="btn primary" disabled={busy} onClick={save}>
          <Save size={16} />
          {busy ? '保存中…' : '保存玩家档案'}
        </button>
      </div>
      <div className="pro-notice">
        尚未取得王者账号官方同步授权。这里保存你手动核对或文件导入的记录，绝不声称已读取游戏账号。估算值不会覆盖真实战力。
      </div>
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
      </div>
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
                setProfile(profileSchema.parse(JSON.parse(await f.text())));
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
            <section className="surface" key={i}>
              <div className="section-title">
                <div className="hero-row">
                  <Portrait hero={heroById(h.heroId)} />
                  <select
                    aria-label={'记录英雄' + (i + 1)}
                    value={h.heroId}
                    onChange={(e) => edit(i, 'heroId', Number(e.target.value))}
                  >
                    {heroes.map((x) => (
                      <option key={x.id} value={x.id}>
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
              <div className="pro-form">
                {[
                  ['power', '游戏内战力'],
                  ['games', '总场次'],
                  ['wins', '总胜场'],
                  ['recentGames', '近期场次'],
                  ['recentWins', '近期胜场'],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={label + (i + 1)}
                      type="number"
                      min={0}
                      value={h[key as keyof typeof h] as number}
                      onChange={(e) => edit(i, key, Number(e.target.value))}
                    />
                  </label>
                ))}
                <label>
                  核对日期
                  <input
                    type="date"
                    value={h.observedOn}
                    onChange={(e) => edit(i, 'observedOn', e.target.value)}
                  />
                </label>
              </div>
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
    </>
  );
}
