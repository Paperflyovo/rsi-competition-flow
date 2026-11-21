'use client';

import { useEffect, useRef, useState } from 'react';
import { directions } from '../../src/research/nodes.mjs';
import { modelProviders, readProviderOverride } from '../../src/research/providers.mjs';
import { ProviderSettings, useProviderSettings } from './ProviderSettings';
import '../../public/flow-editor/appearance.css';
import './research.css';

const eventNames = {
  start: '开始',
  registration: '报名截止',
  submission: '交件截止',
  award: '颁奖',
  registration_month: '报名截止月份',
  final_month: '决赛月份',
};
const time = (value) =>
  value?.length === 7
    ? value.replace('-', ' 年 ') + ' 月'
    : value?.length === 10
      ? value
      : new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(value));
const dateOnly = (value) => time(value).split(' ')[0];
function ResultCard({ row }) {
  const next =
    row.events.find((e) => e.kind === 'registration') ||
    row.events.find((e) => e.kind === 'submission') ||
    row.events.find((e) => e.kind === 'registration_month');
  const live = ['可报名', '开放投稿'].includes(row.status);
  return (
    <article className="resultCard" data-event={row.id}>
      <div className="resultTitle">
        <div>
          <small>{row.tags.join(' / ')}</small>
          <h3>{row.name}</h3>
        </div>
        <span className={'pill ' + (live ? 'yes' : row.status === '已截止' ? 'past' : '')}>
          {row.status}
        </span>
      </div>
      {next && (
        <div className="deadline">
          {eventNames[next.kind]} <b>{time(next.at)}</b>
        </div>
      )}
      <p>{row.reason}</p>
      <details>
        <summary>查看依据与参赛建议</summary>
        {row.eligibility && <Evidence label="参赛资格" item={row.eligibility} />}
        {row.deliverable && <Evidence label="交付要求" item={row.deliverable} />}
        {!row.eligibility && <p>个人或团队资格需以本届细则复核。</p>}
        {row.events.map((e) => (
          <div className="proof" key={e.kind}>
            <strong>
              {eventNames[e.kind]} · {time(e.at)}
            </strong>
            <blockquote>{e.proof}</blockquote>
          </div>
        ))}
        {row.idea && (
          <p>
            <strong>模型提出的选题</strong>　{row.idea}
          </p>
        )}
        {row.issue && <p className="error">{row.issue}</p>}
        {row.checkedAt && (
          <small>
            读取于 {time(row.checkedAt)} · 正文指纹 {row.sha256.slice(0, 12)}
          </small>
        )}
      </details>
      <div className="sourceLinks">
        <a href={row.url} target="_blank" rel="noreferrer">
          主办方原文 ↗
        </a>
        {row.evidenceUrl && row.evidenceUrl !== row.url && (
          <a href={row.evidenceUrl} target="_blank" rel="noreferrer">
            官方赛程数据 ↗
          </a>
        )}
      </div>
    </article>
  );
}
function Evidence({ label, item }) {
  return (
    <div className="proof">
      <strong>{label} · 模型概括</strong>
      <p>{item.summary}</p>
      <blockquote>{item.quote}</blockquote>
    </div>
  );
}
export default function Research() {
  const frame = useRef(null),
    workspace = useRef(null),
    activeRequest = useRef(null);
  const [topology, setTopology] = useState(null),
    [picks, setPicks] = useState([...directions]);
  const [provider, changeProvider] = useProviderSettings();
  const [providerOpen, setProviderOpen] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [busy, setBusy] = useState(false),
    [trace, setTrace] = useState([]),
    [active, setActive] = useState('');
  const [report, setReport] = useState(null),
    [mode, setMode] = useState(''),
    [error, setError] = useState(''),
    [filter, setFilter] = useState('全部'),
    [groupId, setGroupId] = useState(''),
    [loadingArchive, setLoadingArchive] = useState(false),
    [fullScreen, setFullScreen] = useState(false);
  function toCanvas(event) {
    frame.current?.contentWindow?.postMessage({ type: 'competition-run', event }, location.origin);
  }
  function queryCanvas() {
    frame.current?.contentWindow?.postMessage(
      { type: 'competition-canvas-query' },
      location.origin,
    );
  }
  useEffect(() => {
    const receive = (e) => {
      if (
        e.origin === location.origin &&
        e.source === frame.current?.contentWindow &&
        e.data?.type === 'competition-canvas'
      )
        setTopology(e.data);
    };
    window.addEventListener('message', receive);
    const resized = () => setFullScreen(document.fullscreenElement === workspace.current);
    document.addEventListener('fullscreenchange', resized);
    queryCanvas();
    return () => {
      window.removeEventListener('message', receive);
      document.removeEventListener('fullscreenchange', resized);
      activeRequest.current?.abort();
    };
  }, []);
  async function toggleFullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await workspace.current.requestFullscreen();
    } catch {
      setError('浏览器未能切换全屏，可在原尺寸画布继续编辑。');
    }
  }
  function toggle(tag) {
    setPicks((p) => (p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]));
  }
  function show(result, kind) {
    setReport(result);
    setMode(kind);
    setTrace(result.trace ?? []);
    setFilter('全部');
    setGroupId('');
    setActive('');
  }
  async function run() {
    const view = frame.current?.contentWindow.getCompetitionView?.();
    if (!view || activeRequest.current) return;
    let override;
    try {
      if (view.elements.some((node) => (node.kind ?? node.id) === 'extract'))
        override = readProviderOverride(provider);
    } catch (e) {
      setProviderOpen(true);
      setProviderError(e.message);
      return;
    }
    setProviderError('');
    const controller = new AbortController();
    activeRequest.current = controller;
    toCanvas({ type: 'reset' });
    setBusy(true);
    setTrace([]);
    setError('');
    setReport(null);
    setMode('本次运行');
    setActive('检查画布');
    let interruption, reader;
    try {
      const response = await fetch('/api/competition-research', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ view, directions: picks, provider: override }),
      });
      if (!response.ok) {
        const err = await response.json();
        toCanvas({ type: 'invalid', nodeId: err.nodeId, detail: err.error });
        throw Error(err.error || '服务端拒绝了运行。');
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '',
        finished = false;
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (['started', 'stage', 'failed'].includes(event.type)) toCanvas(event);
          if (event.type === 'started') setActive(event.title);
          if (event.type === 'stage' || event.type === 'failed')
            setTrace((prev) => [...prev, event]);
          if (event.type === 'error') throw Error(event.detail);
          if (event.type === 'report') {
            const labels = {
              live: '本次实时调研',
              snapshot: '本次历史数据流程',
              mixed: '本次混合数据流程',
            };
            show(event.report, labels[event.report.mode]);
            finished = true;
          }
        }
        if (done) break;
      }
      if (!finished) throw Error('运行连接已断开，未收到完整结果。');
    } catch (e) {
      const stopped = controller.signal.aborted;
      interruption = stopped ? '本次运行已停止。' : e.message;
      if (!stopped) controller.abort();
      setError(interruption);
      setMode(stopped ? '已停止' : '运行失败');
      setActive('');
    } finally {
      reader?.releaseLock();
      activeRequest.current = null;
      toCanvas({ type: 'done', interruption });
      setBusy(false);
    }
  }
  async function openSnapshot() {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoadingArchive(true);
    setError('');
    try {
      const res = await fetch('/data/competition-snapshot.json', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) throw Error('未能读取赛事快照。');
      show(await res.json(), '赛事快照');
      toCanvas({ type: 'clear' });
    } catch (e) {
      setError(e.message);
    } finally {
      activeRequest.current = null;
      setLoadingArchive(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = report.runId ? 'competition-' + report.runId + '.json' : 'competition-snapshot.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const groupRows = groupId ? report?.groups?.find((g) => g.id === groupId)?.rows : report?.rows;
  const options = ['全部', ...new Set((groupRows || []).map((r) => r.status))];
  const shown = (groupRows || []).filter((r) => filter === '全部' || r.status === filter);
  const runLabel = topology?.liveSources
    ? topology.useSnapshot
      ? '运行混合流程'
      : '运行实时调研'
    : topology?.useSnapshot
      ? '运行历史数据流程'
      : '运行画布';
  return (
    <main className="research">
      <header className="mast">
        <a href="/competitions">
          参赛机会 <span>/ 我的工作台</span>
        </a>
        <a href="#results">调研结果 ↓</a>
      </header>
      <div className="intro">
        <div>
          <h1>参赛调研台</h1>
          <p>从主办方公告中筛选未来一年的参赛机会，核对资格、交件时间和作品要求。</p>
        </div>
        <div className="timeZone">所有时刻均为北京时间</div>
      </div>
      <section className="work" ref={workspace}>
        <div className="flowBlock">
          <div className="sectionHead">
            <h2>可视化流程</h2>
            <div className="boardHeadTools">
              <span>
                {topology
                  ? topology.nodes + ' 个节点 · ' + topology.links + ' 条连线'
                  : '正在读取画布'}
              </span>
              <button className="textButton" onClick={toggleFullScreen}>
                {fullScreen ? '退出全屏' : '全屏编辑'}
              </button>
            </div>
          </div>
          <iframe
            ref={frame}
            onLoad={queryCanvas}
            title="赛事调研流程画布"
            src="/flow-editor"
          />
        </div>
        <aside className="controls">
          <div>
            <h2>运行设置</h2>
            <p>
              {topology?.liveSources
                ? '实时采集范围为未来 12 个月'
                : topology?.useSnapshot
                  ? '赛事状态取自采集当天的快照'
                  : '选择要处理的赛事方向'}
            </p>
          </div>
          <fieldset disabled={busy}>
            <legend>关注方向</legend>
            {directions.map((tag) => (
              <label key={tag}>
                <input type="checkbox" checked={picks.includes(tag)} onChange={() => toggle(tag)} />
                {tag}
              </label>
            ))}
          </fieldset>
          <div className="runActions">
            <button
              type="button"
              className="textButton"
              aria-expanded={providerOpen}
              aria-controls={providerOpen ? 'model-provider-settings' : undefined}
              onClick={() => setProviderOpen(!providerOpen)}
            >
              模型服务 · {modelProviders[provider.kind].label}
            </button>
            <button
              className="primary"
              onClick={run}
              disabled={busy || loadingArchive || !picks.length || !topology}
            >
              {busy ? '正在运行…' : runLabel}
            </button>
            {busy ? (
              <button className="secondary" onClick={() => activeRequest.current?.abort()}>
                停止本次运行
              </button>
            ) : (
              <button className="secondary" onClick={openSnapshot} disabled={loadingArchive}>
                {loadingArchive ? '正在读取…' : '查看赛事快照'}
              </button>
            )}
          </div>
          <small>
            {topology?.modelNodes
              ? '图中有 ' + topology.modelNodes + ' 个模型节点。处理不同公告时可能分别产生费用。'
              : topology?.useSnapshot && !topology?.liveSources
                ? '从本地记录运行，模型调用为 0 次。'
                : ''}
          </small>
          {providerOpen && (
            <ProviderSettings
              selection={provider}
              disabled={busy || loadingArchive}
              error={providerError}
              change={(next) => {
                changeProvider(next);
                setProviderError('');
              }}
            />
          )}
        </aside>
      </section>
      {error && (
        <div role="alert" className="errorBox">
          {error}
        </div>
      )}
      {(busy || trace.length > 0) && (
        <section className="trace">
          <div className="sectionHead">
            <h2>运行轨迹</h2>
            <span aria-live="polite">{busy ? '进行中 · ' + active : mode}</span>
          </div>
          <ol>
            {trace.map((e) => (
              <li key={e.id} className={e.status}>
                <b>{e.title}</b>
                <p>{e.detail}</p>
                <small>
                  {e.status === 'skipped' ? '已跳过 · ' : e.status === 'failed' ? '失败 · ' : ''}
                  {(e.elapsedMs / 1000).toFixed(1)} 秒
                </small>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section id="results" className="results">
        <div className="sectionHead">
          <h2>赛事清单{report ? ' · ' + report.rows.length : ''}</h2>
          {report && (
            <button className="textButton" onClick={download}>
              {report.runId ? '下载本次记录' : '下载快照'} ↓
            </button>
          )}
        </div>
        {!report && (
          <p className="empty">运行调研或打开赛事快照，查看各场比赛与主办方原文。</p>
        )}
        {report && (
          <>
            <div className="runMeta">
              <b>{mode}</b>　{time(report.input?.startedAt ?? report.asOf)}
              {report.input && report.mode !== 'snapshot' &&
                ' · 调研至 ' + dateOnly(report.input.windowEndsAt)}
              {report.provenance?.snapshot &&
                ' · 快照采集于 ' + time(report.provenance.snapshot.asOf)}
              {report.model?.provider && ' · ' + report.model.provider}
              {report.model?.model && ' · ' + report.model.model}
              {report.modelCalls && ' · 模型调用 ' + report.modelCalls.length + ' 次'}
              {report.runId && <>　·　运行编号 <code>{report.runId.slice(0, 8)}</code></>}
            </div>
            {report.groups?.length > 0 && (
              <label className="groupPicker">
                输出清单
                <select
                  value={groupId}
                  onChange={(e) => {
                    setGroupId(e.target.value);
                    setFilter('全部');
                  }}
                >
                  <option value="">全部清单（去重 {report.rows.length} 项）</option>
                  {report.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}（{g.rows.length} 项）
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="filters" aria-label="按状态筛选">
              {options.map((v) => (
                <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>
                  {v}
                </button>
              ))}
            </div>
            {!shown.length && <p className="empty">这份清单中没有符合当前条件的赛事。</p>}
            <div className="cards">
              {shown.map((row) => (
                <ResultCard key={row.id} row={row} />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
