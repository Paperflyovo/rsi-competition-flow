import { makeLink, makeNode } from './graph.mjs';

export function blankView() {
  return { schemaVersion: 2, id: 'lab-competition', title: '未命名流程', elements: [], links: [] };
}

export function researchTemplate() {
  const kinds = ['start', 'discover', 'fetch', 'extract', 'audit', 'rank', 'publish', 'end'];
  return {
    ...blankView(),
    title: '实时赛事调研',
    elements: kinds.map((kind, i) => makeNode(kind, kind, 34 + (i % 4) * 206, i < 4 ? 48 : 234)),
    links: kinds.slice(1).map((kind, i) => makeLink(kinds[i], 'out', kind, 'in')),
  };
}

export function branchTemplate() {
  return {
    ...blankView(),
    title: '历史赛事分流',
    elements: [
      makeNode('start', 'start', 26, 44),
      makeNode('snapshot', 'history', 229, 44),
      makeNode('branch', 'decision', 431, 44, '是否已截止', { field: 'status', value: '已截止' }),
      makeNode('publish', 'archive', 641, 30, '已截止归档'),
      makeNode('publish', 'watch', 641, 207, '继续关注'),
      makeNode('end', 'end', 433, 302),
    ],
    links: [
      makeLink('start', 'out', 'history', 'in'),
      makeLink('history', 'out', 'decision', 'in'),
      makeLink('decision', 'yes', 'archive', 'in'),
      makeLink('decision', 'no', 'watch', 'in'),
      makeLink('archive', 'out', 'end', 'in'),
      makeLink('watch', 'out', 'end', 'in'),
    ],
  };
}
