import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { catalogue, readOrganizer } from './sources.mjs';
import { extractRequirements } from './model.mjs';
import { matchesRow, statuses } from './nodes.mjs';

function classify(doc, analysis, input) {
  const events = doc.events,
    moment = Date.parse(input.startedAt),
    end = Date.parse(input.windowEndsAt);
  const entry = events.find((x) => x.kind === 'registration'),
    submission = events.find((x) => x.kind === 'submission'),
    start = events.find((x) => x.kind === 'start');
  const cutoff = entry || submission;
  if (cutoff && Date.parse(cutoff.at) < moment)
    return ['已截止', entry ? '新队伍的报名窗口已结束。' : '已经过作品征集截止时间。'];
  if (start && Date.parse(start.at) > end) return ['仅跟踪', '本届开始时间在本次一年窗口之外。'];
  if (!cutoff) {
    const month = events.find((e) => e.kind === 'registration_month');
    if (month) {
      const currentMonth = new Date(moment + 8 * 3600000).toISOString().slice(0, 7);
      if (currentMonth > month.at) return ['已截止', '已过主办方公布的报名截止月份。'];
      if (currentMonth === month.at)
        return ['待核实', '已进入截止月份，主办方尚未在本页给出具体日期。'];
      if (month.at > new Date(end + 8 * 3600000).toISOString().slice(0, 7))
        return ['仅跟踪', '截止月份在本次窗口之外。'];
      return ['待核实', '主办方只公布了报名截止月份，可先查报名入口，暂不安排具体交件日。'];
    }
    const upcoming =
      doc.id === '4c' &&
      doc.excerpts.find((t) => /20\d\d年（第\d+届）中国大学生计算机设计大赛/.test(t));
    if (upcoming) {
      const year = +upcoming.match(/(20\d\d)年（第/)[1];
      if (year >= new Date(moment).getUTCFullYear() && year <= new Date(end).getUTCFullYear())
        return ['待官宣', '已找到本届主题，本次核对的公告未给出报名及交件日期。'];
      return ['仅跟踪', '该公告只提供其他年度的主题。'];
    }
    return ['待核实', '当前页面未解析出带用途的报名或交件截止时间。'];
  }
  if (Date.parse(cutoff.at) > end && (!start || Date.parse(start.at) > moment))
    return ['仅跟踪', '截止时间在本次窗口以外，尚无窗口内开放的依据。'];
  if (start && Date.parse(start.at) > moment) return ['即将开始', '已公布开赛或作品征集开始时间。'];
  if (!analysis.deliverable || analysis.issue) return ['待核实', '交件条件或所引原文需人工复查。'];
  return entry
    ? ['可报名', '报名截止尚未到达，请按资格条款核实每位成员。']
    : ['开放投稿', '主办方给出了当前作品征集的截止时间，请按规则核对个人资格。'];
}

function auditRows({ docs, errors, byId }, scope) {
  const rows = docs.map((doc) => {
    const analysis = byId.get(doc.id);
    const [status, reason] = classify(doc, analysis, scope);
    return {
      id: doc.id,
      name: doc.name,
      tags: doc.tags,
      url: doc.url,
      evidenceUrl: doc.feed || doc.url,
      checkedAt: doc.checkedAt,
      sha256: doc.sha256,
      events: doc.events,
      status,
      reason,
      ...analysis,
    };
  });
  for (const item of errors)
    rows.push({
      id: item.id,
      name: item.name,
      tags: item.tags,
      url: item.url,
      status: '来源异常',
      reason: item.error,
      events: [],
      eligibility: null,
      deliverable: null,
      idea: null,
    });
  return rows;
}

export function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
const deadline = (row) =>
  row.events.find((e) => e.kind === 'registration')?.at ||
  row.events.find((e) => e.kind === 'submission')?.at ||
  '9999';
function sortRows(rows, by) {
  return [...rows].sort((a, b) => {
    const nameOrder = () => a.name.localeCompare(b.name, 'zh');
    if (by === '赛事名称') return nameOrder();
    const dates = deadline(a).localeCompare(deadline(b));
    if (by === '截止时间') return dates || nameOrder();
    return statuses.indexOf(a.status) - statuses.indexOf(b.status) || dates || nameOrder();
  });
}
const result = (value, detail) => ({ outputs: { out: value }, detail });

export function researchOperations(scope, signal, provider) {
  const fetched = new Map(),
    extracted = new Map(),
    modelCalls = [];
  const provenance = { live: false, snapshot: null };
  let savedSnapshot;
  let groups = [];

  const actions = {
    start() {
      return result(scope, scope.directions.join('、'));
    },
    discover(node, { in: range }) {
      const selected = node.settings.direction;
      const sources = catalogue.filter((source) =>
        source.tags.some(
          (tag) =>
            range.directions.includes(tag) && (selected === '跟随调研范围' || tag === selected),
        ),
      );
      return result(sources, '匹配到 ' + sources.length + ' 个主办方入口。');
    },
    async fetch(node, { in: sources }) {
      const pages = await Promise.all(
        sources.map((source) => {
          if (!fetched.has(source.id)) {
            fetched.set(
              source.id,
              readOrganizer(source, signal).catch((error) => {
                signal?.throwIfAborted();
                return { ...source, error: error.cause?.code || error.message };
              }),
            );
          }
          return fetched.get(source.id);
        }),
      );
      const docs = pages.filter((page) => !page.error),
        errors = pages.filter((page) => page.error);
      if (pages.length && !docs.length)
        throw Error('全部来源读取失败：' + errors.map((p) => p.name + ' ' + p.error).join('、'));
      provenance.live = true;
      return result(
        { docs, errors },
        '读到 ' + docs.length + ' 份公告，' + errors.length + ' 个来源异常。',
      );
    },
    async extract(node, { in: pages }) {
      if (!pages.docs.length)
        return result({ ...pages, byId: new Map() }, '来源为空，模型调用 0 次。');
      const key = JSON.stringify(
        pages.docs.map((d) => [d.id, d.sha256]).sort(([a], [b]) => a.localeCompare(b)),
      );
      const reuse = extracted.has(key);
      if (!reuse) {
        const { byId, ...usage } = await extractRequirements(pages.docs, signal, provider);
        extracted.set(key, byId);
        modelCalls.push({ nodeId: node.id, ...usage });
      }
      return result(
        { ...pages, byId: extracted.get(key) },
        (reuse ? '复用本次相同公告的模型结果，共 ' : '模型已提取 ') + pages.docs.length + ' 条。',
      );
    },
    audit(node, { in: analysis }) {
      const rows = auditRows(analysis, scope);
      return result(
        rows,
        rows.filter((r) => r.deliverable).length +
          ' 项交付物有原文，' +
          rows.filter((r) => r.issue).length +
          ' 项摘录需复核。',
      );
    },
    async snapshot(node, { in: range }) {
      if (!savedSnapshot) {
        const file = path.join(process.cwd(), 'public', 'data', 'competition-snapshot.json');
        savedSnapshot = JSON.parse(await readFile(file, 'utf8'));
      }
      provenance.snapshot = { asOf: savedSnapshot.asOf };
      const rows = savedSnapshot.rows.filter((row) =>
        row.tags.some((tag) => range.directions.includes(tag)),
      );
      return result(rows, '读取赛事快照中的 ' + rows.length + ' 项，沿用采集时的日期和状态。');
    },
    filter(node, { in: rows }) {
      const selected = rows.filter((row) => matchesRow(row, node.settings));
      return result(selected, '保留 ' + selected.length + ' / ' + rows.length + ' 项。');
    },
    branch(node, { in: rows }) {
      const yes = [],
        no = [];
      for (const row of rows) (matchesRow(row, node.settings) ? yes : no).push(row);
      // An absent output disables just that branch. An ordinary empty list is a valid value.
      const outputs = {};
      if (yes.length) outputs.yes = yes;
      if (no.length) outputs.no = no;
      return { outputs, detail: '符合 ' + yes.length + ' 项，其余 ' + no.length + ' 项。' };
    },
    merge(node, { a = [], b = [] }) {
      const rows = uniqueRows([...a, ...b]);
      return result(
        rows,
        '输入 A ' + a.length + ' 项，B ' + b.length + ' 项，去重后 ' + rows.length + ' 项。',
      );
    },
    rank(node, { in: rows }) {
      return result(
        sortRows(rows, node.settings.by),
        '已按' + node.settings.by + '排列 ' + rows.length + ' 项。',
      );
    },
    limit(node, { in: rows }) {
      const selected = rows.slice(0, node.settings.count);
      return result(selected, '保留前 ' + selected.length + ' 项。');
    },
    publish(node, { in: rows }) {
      return result({ id: node.id, title: node.name, rows }, '生成 ' + rows.length + ' 项清单。');
    },
    end(node, { in: lists }) {
      groups = lists;
      return { outputs: {}, detail: '收到 ' + lists.length + ' 份命名清单。' };
    },
  };
  return { actions, modelCalls, provenance, getGroups: () => groups };
}

export function portStats(port, value) {
  let items;
  if (value !== undefined) {
    if (port.many) items = value.map((list) => list.title);
    else if (Array.isArray(value)) items = value;
    else if (port.type === 'scope') items = value.directions;
    else if (port.type === 'list') items = value.rows;
    else items = [...value.docs, ...value.errors];
  }
  return {
    key: port.key,
    label: port.label,
    type: port.type,
    active: value !== undefined,
    count: items?.length ?? 0,
    sample: (items || []).slice(0, 3).map((item) => (typeof item === 'string' ? item : item.name)),
  };
}
