export const directions = ['智能体', 'AI 应用', '游戏开发'];
export const statuses = [
  '可报名',
  '开放投稿',
  '即将开始',
  '待官宣',
  '待核实',
  '仅跟踪',
  '已截止',
  '来源异常',
];

export const portTypes = {
  scope: ['调研范围', '#95baff'],
  sources: ['赛事入口', '#6bd6c1'],
  documents: ['公告原文', '#eab96d'],
  analysis: ['提取结果', '#cd9ef3'],
  rows: ['赛事记录', '#8cce99'],
  list: ['命名清单', '#f09faf'],
};

const pin = (key, type, label, many = false) => ({ key, type, label, many });
const input = (type) => [pin('in', type, portTypes[type][0])];
const output = (type) => [pin('out', type, portTypes[type][0])];

export const nodeTypes = {
  start: { title: '开始', group: '输入', inputs: [], outputs: output('scope') },
  discover: {
    title: '选择赛事入口',
    group: '采集',
    inputs: input('scope'),
    outputs: output('sources'),
  },
  fetch: {
    title: '取主办方原文',
    group: '采集',
    inputs: input('sources'),
    outputs: output('documents'),
  },
  extract: {
    title: '提取参赛条件',
    group: '模型',
    inputs: input('documents'),
    outputs: output('analysis'),
  },
  audit: {
    title: '核对证据与日期',
    group: '核验',
    inputs: input('analysis'),
    outputs: output('rows'),
  },
  snapshot: {
    title: '读取历史实跑',
    group: '输入',
    inputs: input('scope'),
    outputs: output('rows'),
  },
  filter: { title: '筛选赛事', group: '处理', inputs: input('rows'), outputs: output('rows') },
  branch: {
    title: '条件分流',
    group: '处理',
    inputs: input('rows'),
    outputs: [pin('yes', 'rows', '符合'), pin('no', 'rows', '其余')],
  },
  merge: {
    title: '合并去重',
    group: '处理',
    inputs: [pin('a', 'rows', '输入 A'), pin('b', 'rows', '输入 B')],
    outputs: output('rows'),
  },
  rank: { title: '排列优先级', group: '处理', inputs: input('rows'), outputs: output('rows') },
  limit: { title: '截取前几项', group: '处理', inputs: input('rows'), outputs: output('rows') },
  publish: { title: '生成参赛清单', group: '输出', inputs: input('rows'), outputs: output('list') },
  end: {
    title: '结束',
    group: '输出',
    inputs: [pin('in', 'list', '清单 · 可多接', true)],
    outputs: [],
  },
};

export const sortModes = ['状态优先', '截止时间', '赛事名称'];
export const fields = { status: '赛事状态', direction: '赛事方向' };
export const valuesFor = (field) => (field === 'direction' ? directions : statuses);

export function settingsFor(kind, settings = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings))
    throw Error('节点参数格式无效。');
  if (kind === 'filter' || kind === 'branch') {
    const { field = 'status', value = '可报名' } = settings;
    if (!Object.hasOwn(fields, field) || !valuesFor(field).includes(value))
      throw Error('请选择有效的筛选字段和值。');
    return { field, value };
  }
  if (kind === 'rank') {
    const by = settings.by ?? sortModes[0];
    if (!sortModes.includes(by)) throw Error('排序方式无效。');
    return { by };
  }
  if (kind === 'limit') {
    const count = settings.count ?? 3;
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000)
      throw Error('截取数量须为 1 到 1000 的整数。');
    return { count };
  }
  if (kind === 'discover') {
    const direction = settings.direction ?? '跟随调研范围';
    if (!['跟随调研范围', ...directions].includes(direction)) throw Error('来源方向无效。');
    return { direction };
  }
  return {};
}

export function nodeSummary(node) {
  const { kind, settings } = node;
  if (kind === 'branch' || kind === 'filter')
    return fields[settings.field] + ' = ' + settings.value;
  if (kind === 'rank') return settings.by;
  if (kind === 'limit') return '保留前 ' + settings.count + ' 项';
  if (kind === 'discover') return settings.direction;
  if (kind === 'snapshot') return '沿用采集时的状态';
  if (kind === 'merge') return '同一赛事优先保留 A';
  return '';
}

export function matchesRow(row, settings) {
  return settings.field === 'direction'
    ? row.tags.includes(settings.value)
    : row.status === settings.value;
}
