import { nodeTypes, portTypes, settingsFor } from './nodes.mjs';

export const MAX_NODES = 128;
export const MAX_LINKS = 512;
const legacyKinds = ['start', 'discover', 'fetch', 'extract', 'audit', 'rank', 'publish', 'end'];

export class GraphError extends Error {
  constructor(message, nodeId) {
    super(message);
    this.nodeId = nodeId;
  }
}

export function makeNode(kind, id, x, y, name = nodeTypes[kind].title, settings = {}) {
  let normalized;
  try {
    normalized = settingsFor(kind, settings);
  } catch (error) {
    throw new GraphError('“' + name + '”的参数无效。' + error.message, id);
  }
  return {
    id,
    kind,
    type: 'stage',
    name,
    x,
    y,
    settings: normalized,
    locked: false,
    select: false,
  };
}
export function makeLink(fromElementId, fromPort, toElementId, toPort, id) {
  return {
    id: id ?? [fromElementId, fromPort, toElementId, toPort].join('.'),
    type: 'route',
    fromElementId,
    fromPort,
    toElementId,
    toPort,
    name: '',
    points: [],
  };
}
function safeId(id, max = 64) {
  return (
    typeof id === 'string' &&
    id.length <= max &&
    /^[a-zA-Z][a-zA-Z0-9._-]*$/.test(id) &&
    !Object.hasOwn(Object.prototype, id) &&
    id !== 'prototype'
  );
}
function readPosition(value) {
  if (!Number.isFinite(value) || Math.abs(value) > 100000) throw Error('节点坐标无效。');
  return Math.round(value);
}
function inputPort(node, key) {
  return nodeTypes[node.kind].inputs.find((p) => p.key === key);
}
export function outputPort(node, key) {
  return nodeTypes[node.kind].outputs.find((p) => p.key === key);
}

function checkEdge(nodes, edge) {
  const source = nodes.get(edge.fromElementId),
    target = nodes.get(edge.toElementId);
  if (!source || !target) throw new GraphError('连线的一端引用了不存在的节点。');
  if (source.id === target.id) throw new GraphError('节点不能接回自身。', source.id);
  const out = outputPort(source, edge.fromPort),
    into = inputPort(target, edge.toPort);
  if (!out || !into) throw new GraphError('连线引用了不存在的端口。', target.id);
  if (out.type !== into.type) {
    throw new GraphError(
      portTypes[out.type][0] +
        '不能连接到“' +
        target.name +
        '”的' +
        portTypes[into.type][0] +
        '输入。',
      target.id,
    );
  }
  return into;
}

// Normalize imported drafts before passing them to the vendor component, which assumes valid node references.
export function readView(raw) {
  if (
    (raw?.schemaVersion !== undefined && raw.schemaVersion !== 2) ||
    !Array.isArray(raw?.elements) ||
    !Array.isArray(raw?.links)
  )
    throw Error('无法识别这份流程文件。');
  if (raw.elements.length > MAX_NODES || raw.links.length > MAX_LINKS)
    throw Error('单图支持最多 128 个节点和 512 条连线。');
  const nodes = new Map();
  for (const item of raw.elements) {
    const kind = item?.kind ?? (legacyKinds.includes(item?.id) ? item.id : null);
    if (!safeId(item?.id) || nodes.has(item.id) || !Object.hasOwn(nodeTypes, kind))
      throw Error('节点 ID 重复、无效或节点类型未知。');
    const name = item.name ?? nodeTypes[kind].title;
    if (typeof name !== 'string' || !name.trim() || name.length > 64)
      throw new GraphError('节点名称须为 1–64 个字符。', item.id);
    nodes.set(
      item.id,
      makeNode(
        kind,
        item.id,
        readPosition(item.x),
        readPosition(item.y),
        name.trim(),
        item.settings,
      ),
    );
  }
  const ids = new Set(),
    endpoints = new Set(),
    occupied = new Set();
  const links = raw.links.map((item) => {
    const source = nodes.get(item?.fromElementId),
      target = nodes.get(item?.toElementId);
    if (!source || !target) throw Error('连线引用了不存在的节点。');
    const outputs = nodeTypes[source.kind].outputs,
      inputs = nodeTypes[target.kind].inputs;
    const edge = makeLink(
      source.id,
      item.fromPort ?? (outputs.length === 1 ? outputs[0].key : null),
      target.id,
      item.toPort ?? (inputs.length === 1 ? inputs[0].key : null),
      item.id,
    );
    const into = checkEdge(nodes, edge);
    if (!safeId(edge.id, 300) || ids.has(edge.id))
      throw new GraphError('连线 ID 重复或无效。', target.id);
    const destination = JSON.stringify([target.id, into.key]);
    const pair = JSON.stringify([source.id, edge.fromPort, target.id, into.key]);
    if (endpoints.has(pair)) throw new GraphError('这两个端口已连接。', target.id);
    if (!into.many && occupied.has(destination))
      throw new GraphError('“' + target.name + '”的该输入已有连线，请先断开。', target.id);
    ids.add(edge.id);
    endpoints.add(pair);
    occupied.add(destination);
    return edge;
  });
  const title = raw.title ?? '赛事调研流程';
  if (typeof title !== 'string' || title.length > 80) throw Error('流程名称须在 80 个字符以内。');
  return {
    schemaVersion: 2,
    id: 'lab-competition',
    title: title.trim() || '未命名流程',
    elements: [...nodes.values()],
    links,
  };
}

function graphIndex(view) {
  const nodes = new Map(view.elements.map((node) => [node.id, node]));
  const incoming = new Map(),
    outgoing = new Map();
  for (const id of nodes.keys()) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const edge of view.links) {
    incoming.get(edge.toElementId).push(edge);
    outgoing.get(edge.fromElementId).push(edge);
  }
  return { nodes, incoming, outgoing };
}

function topologicalOrder({ nodes, incoming, outgoing }) {
  const remaining = new Map([...incoming].map(([id, edges]) => [id, edges.length]));
  const order = [...nodes.keys()].filter((id) => remaining.get(id) === 0);
  for (let cursor = 0; cursor < order.length; cursor++) {
    for (const { toElementId: target } of outgoing.get(order[cursor])) {
      const count = remaining.get(target) - 1;
      remaining.set(target, count);
      if (count === 0) order.push(target);
    }
  }
  if (order.length !== nodes.size) {
    const id = [...remaining.keys()].find((key) => remaining.get(key) > 0);
    throw new GraphError('存在环路，请检查“' + nodes.get(id).name + '”及其上游连线。', id);
  }
  return order.map((id) => nodes.get(id));
}

export function addConnection(view, edge) {
  const draft = readView({ ...view, links: [...view.links, edge] });
  topologicalOrder(graphIndex(draft));
  return draft;
}

// Also arrange incomplete drafts. Nodes at the same depth can occupy the same column.
export function dependencyLayers(view) {
  const index = graphIndex(view);
  const depths = new Map();
  const layers = [];
  for (const node of topologicalOrder(index)) {
    const parents = index.incoming.get(node.id);
    const depth = parents.reduce(
      (level, edge) => Math.max(level, depths.get(edge.fromElementId) + 1),
      0,
    );
    depths.set(node.id, depth);
    (layers[depth] ??= []).push(node);
  }
  return layers;
}

export function compileGraph(raw) {
  const view = readView(raw);
  const index = graphIndex(view);
  for (const kind of ['start', 'end']) {
    const found = view.elements.filter((node) => node.kind === kind);
    if (found.length !== 1)
      throw new GraphError('运行需要恰好一个“' + nodeTypes[kind].title + '”节点。', found[1]?.id);
  }
  const order = topologicalOrder(index);
  for (const node of order) {
    for (const input of nodeTypes[node.kind].inputs) {
      if (!index.incoming.get(node.id).some((edge) => edge.toPort === input.key))
        throw new GraphError('“' + node.name + '”的“' + input.label + '”输入尚未连接。', node.id);
    }
    if (node.kind !== 'end' && !index.outgoing.get(node.id).length)
      throw new GraphError('“' + node.name + '”缺少出线，请接到下游或删除此节点。', node.id);
  }
  // With a single source and sink, every node of this acyclic graph is now on a start-to-end path.
  return { view, order, incoming: index.incoming };
}
