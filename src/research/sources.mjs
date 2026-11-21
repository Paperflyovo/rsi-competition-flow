import { load } from 'cheerio';
import { createHash } from 'node:crypto';

// Entry points are curated. Dates, requirements and evidence are read anew on each live run.
export const catalogue = [
  {
    id: 'qoder',
    name: 'Qoder 高校创造力大赛',
    tags: ['智能体', 'AI 应用'],
    url: 'https://tianchi.aliyun.com/competition/entrance/532536/introduction',
    feed: 'https://tianchi.aliyun.com/v3/proxy/competition/api/race/getDetail?raceId=532536',
    zone: '北京时间',
  },
  {
    id: 'agentweb',
    name: 'Open Agentic Web Challenge',
    tags: ['智能体', 'AI 应用'],
    url: 'https://cognizant-agenticweb.devpost.com/rules',
    zone: '美国太平洋时间',
  },
  {
    id: 'gameoff',
    name: 'GitHub Game Off',
    tags: ['游戏开发'],
    url: 'https://github.blog/open-source/gaming/game-off-2026-the-theme-is-shift/',
    zone: 'PST',
  },
  {
    id: 'tencent',
    name: '腾讯游戏创作大赛 · 主赛区',
    tags: ['游戏开发'],
    url: 'https://gameinstitute.qq.com/awards2026/rule',
    zone: '北京时间',
  },
  {
    id: '4c',
    name: '中国大学生计算机设计大赛',
    tags: ['AI 应用', '游戏开发'],
    url: 'https://jsjds.blcu.edu.cn/info/1041/2954.htm',
    zone: '北京时间',
  },
  {
    id: 'relate',
    name: 'Neo4j Relate Challenge',
    tags: ['AI 应用', '智能体'],
    url: 'https://relate.devpost.com/rules',
    zone: 'PST',
  },
  {
    id: 'agentware',
    name: 'Agentware Hackathon',
    tags: ['智能体'],
    url: 'https://www.agentwarehack.com/',
    zone: 'UTC',
  },
  {
    id: 'dubai',
    name: 'Create AI Agents Championship',
    tags: ['智能体', 'AI 应用'],
    url: 'https://www.dubaichamberdigital.com/en/create-ai-agents',
    zone: '公告仅到月份',
  },
];
const clean = (s) => s.replace(/\s+/g, ' ').trim();
function decodeHtml(html, id) {
  const $ = load(html);
  let staticLines = [];
  // The Agentware page includes a static accessible copy as escaped HTML.
  if (id === 'agentware') {
    const copy = $('noscript,textarea,pre,template')
      .toArray()
      .map((el) => $(el).text())
      .find((t) => t.includes('<li>') && t.includes('Code freeze'));
    if (copy) staticLines = decodeHtml(copy, 'agentware-copy');
  }
  $('script,style,nav,header,footer,iframe,svg,noscript,template,textarea').remove();
  let selection =
    id === '4c'
      ? $('.v_news_content').first()
      : id === 'gameoff'
        ? $('.post__content').first()
        : id === 'tencent'
          ? $('.page-rule').first()
          : $('main').first();
  if (!selection.length) selection = $('body');
  selection.find('p,h1,h2,h3,h4,li,div,section,tr,br,dt,dd').append('\n');
  const visibleLines = selection
    .text()
    .split(/\n|(?<=[；。])(?=\d+[.、])/)
    .map(clean)
    .filter(Boolean);
  return [...staticLines, ...visibleLines];
}
const months =
  'January February March April May June July August September October November December'.split(
    ' ',
  );
function localIso(year, month, day, hour, minute, zone) {
  const instant = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute));
  if (
    instant.getUTCMonth() !== +month - 1 ||
    instant.getUTCDate() !== +day ||
    +hour > 23 ||
    +minute > 59
  )
    throw Error('公告日期无法解析');
  if (zone === '美国太平洋时间') {
    // The IANA time zone distinguishes PDT and PST, including January deadlines.
    const atNoon = new Date(Date.UTC(+year, +month - 1, +day, 20));
    const zonePart = new Intl.DateTimeFormat('en', {
      timeZone: 'America/Los_Angeles',
      timeZoneName: 'shortOffset',
    })
      .formatToParts(atNoon)
      .find((p) => p.type === 'timeZoneName').value;
    zone = zonePart.endsWith('-7') ? 'PDT' : 'PST';
  }
  const offset = { 北京时间: 8, UTC: 0, PST: -8, PDT: -7 }[zone];
  if (offset == null) throw Error('公告时区无法解析');
  return new Date(+instant - offset * 3600000).toISOString();
}
function englishDate(phrase, zone) {
  const date = phrase.match(/([A-Z][a-z]+)\s+(\d{1,2}),?\s+(20\d\d)/);
  const clock = phrase.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!date || !clock || !months.includes(date[1])) return null;
  let hour = +clock[1];
  if (clock[3]) hour = (hour % 12) + (clock[3].toLowerCase() === 'pm' ? 12 : 0);
  return localIso(date[3], months.indexOf(date[1]) + 1, date[2], hour, clock[2], zone);
}
function chineseDate(phrase) {
  const m = phrase.match(/(20\d\d)年(\d{1,2})月(\d{1,2})日(?:(\d{1,2})时(\d{1,2})分)?/);
  if (!m) return null;
  return m[4] == null
    ? [m[1], m[2].padStart(2, '0'), m[3].padStart(2, '0')].join('-')
    : localIso(...m.slice(1), '北京时间');
}
function htmlDates(source, lines) {
  const full = lines.join(' ');
  const events = [];
  const add = (kind, proof, at) => {
    if (proof && at) events.push({ kind, at, proof: clean(proof), zone: source.zone });
  };
  if (source.id === 'tencent') {
    const interval = full.match(
      /作品征集时间[：:]\s*自\s*(20\d\d年[\d月日时分]+)\s*至\s*(20\d\d年[\d月日时分]+)止/,
    );
    if (interval) {
      add('start', interval[0], chineseDate(interval[1]));
      add('submission', interval[0], chineseDate(interval[2]));
    }
    const award = full.match(/颁奖典礼[：:]\s*(20\d\d年\d{1,2}月\d{1,2}日)/);
    if (award) add('award', award[0], chineseDate(award[1]));
  }
  if (source.id === 'gameoff') {
    const end = full.match(
      /(?:submit your game on itch\.io before|you have until)\s+([A-Z][a-z]+ \d{1,2}, 20\d\d,? at \d{1,2}:\d{2} PST)/i,
    );
    if (end) add('submission', end[0], englishDate(end[1], 'PST'));
  }
  if (source.id === 'agentweb') {
    const period = full.match(
      /Submission Period:\s*(.{1,110}?Pacific Time\))\s*[–—-]\s*(.{1,110}?Pacific Time\))/i,
    );
    if (period) {
      add('start', period[0], englishDate(period[1], source.zone));
      add('submission', period[0], englishDate(period[2], source.zone));
    }
  }
  if (source.id === 'relate') {
    const period = full.match(/Contest runs from\s+(.{1,85}?20\d\d)\s+to\s+(.{1,85}?20\d\d)/i);
    if (period) {
      add('start', period[0], englishDate(period[1], 'PST'));
      add('submission', period[0], englishDate(period[2], 'PST'));
    }
  }
  if (source.id === 'agentware') {
    const stamp =
      '([A-Z][a-z]+ \\d{1,2}, 20\\d\\d\\s*(?:@\\s*|,\\s*)?\\d{1,2}:\\d{2} UTC)\\s*[:.]?\\s*';
    for (const [kind, signal] of [
      ['start', 'Kickoff'],
      ['submission', 'Code freeze'],
    ]) {
      const m = full.match(new RegExp(stamp + signal, 'i'));
      if (m) add(kind, m[0], englishDate(m[1], 'UTC'));
    }
  }
  if (source.id === 'dubai') {
    for (const [kind, pattern] of [
      ['registration_month', /Registrations close in ([A-Z][a-z]+) (20\d\d)/i],
      ['final_month', /Grand Final in the first week of ([A-Z][a-z]+) (20\d\d)/i],
    ]) {
      const m = full.match(pattern);
      if (m && months.includes(m[1]))
        add(kind, m[0], m[2] + '-' + String(months.indexOf(m[1]) + 1).padStart(2, '0'));
    }
  }
  return events;
}
function readTianchi(raw) {
  const { race, raceTimeline } = JSON.parse(raw).data;
  if (!race || !Array.isArray(raceTimeline)) throw Error('天池未返回赛事及赛程');
  const lines = [race.name, race.introduction, race.information]
    .filter((x) => typeof x === 'string')
    .join('\n')
    .split(/[\r\n]+/)
    .map((s) => clean(s.replace(/[*#]/g, '')))
    .filter(Boolean);
  const events = [];
  for (const period of raceTimeline) {
    const fields = [
      { name: 'startTime', time: period.startTime },
      ...(period.timePointConfig || []),
    ];
    for (const entry of fields) {
      const kind = { startTime: 'start', 报名截止: 'registration', 提交结果截止: 'submission' }[
        entry.name
      ];
      if (!kind) continue;
      const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):\d\d$/.exec(entry.time);
      if (m)
        events.push({
          kind,
          at: localIso(...m.slice(1), '北京时间'),
          proof: entry.name + ' ' + entry.time,
          zone: '北京时间',
        });
    }
  }
  return { lines, events };
}
const relevant =
  /资格|在校|参赛对象|报名|学生|认证|组队|团队|提交|参赛作品|作品征集|部署|主题|方向|计分|智能体|数媒|eligib|anyone|any skill|age of|years of age|individuals|teams?|submit|submission|repository|source code|new projects|rules|deadline|game jam|build a|playable|JSON|browser|code freeze|kickoff|demo|judg|agentic/i;
function passages(lines) {
  const collected = [];
  for (const line of lines) {
    if (!relevant.test(line) || line.length < 10) continue;
    const parts = line.match(/[^。！？]+[。！？]?/g) || [line];
    for (const part of parts) {
      const value = clean(part).slice(0, 700);
      if (relevant.test(value) && !collected.includes(value)) collected.push(value);
    }
  }
  // Keep eligibility and submission instructions even if the homepage opens with marketing.
  const priority =
    /参赛对象|学生|组队|须|报名时|天池赛题|提交清单|Qoder Sites|投稿作品|二十四节气|eligible individuals|age of majority|18 years|teams? (?:of|up to)|must (?:be|use|submit|include)|public (?:GitHub|repository|JSON)|submit your game|open.source repository|individuals? (?:or|who)|new projects only|anyone/i;
  return [
    ...collected.filter((x) => priority.test(x)),
    ...collected.filter((x) => !priority.test(x)),
  ]
    .filter((v, i, list) => list.indexOf(v) === i)
    .slice(0, 30);
}
export async function readOrganizer(source, signal) {
  const response = await fetch(source.feed || source.url, {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(18000)]) : AbortSignal.timeout(18000),
  });
  if (!response.ok) throw Error('主办方 HTTP ' + response.status);
  const raw = await response.text();
  const body = source.feed
    ? readTianchi(raw)
    : (() => {
        const lines = decodeHtml(raw, source.id);
        return { lines, events: htmlDates(source, lines) };
      })();
  const excerpts = passages(body.lines);
  if (!excerpts.length) throw Error('网页没有可核验的规则正文');
  return {
    ...source,
    checkedAt: new Date().toISOString(),
    sha256: createHash('sha256').update(raw).digest('hex'),
    events: body.events,
    excerpts,
  };
}
