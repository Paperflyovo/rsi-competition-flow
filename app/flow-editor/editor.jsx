'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  addConnection,
  compileGraph,
  dependencyLayers,
  makeLink,
  makeNode,
  outputPort,
  readView,
} from '../../src/research/graph.mjs';
import { nodeTypes } from '../../src/research/nodes.mjs';
import { blankView, branchTemplate, researchTemplate } from '../../src/research/templates.mjs';
import { Board, ConnectionPreview, FlowDiagram, initialCamera, NODE_HEIGHT, NODE_WIDTH } from './diagram.jsx';
import { EditText, Inspector, NodeMenu } from './panels.jsx';

const storageKey = 'competition-flow.blueprint.v2';
const historyLimit = 40;
const clone = (graph) => structuredClone(graph);
function loadDraft() {
  try {
    const saved = localStorage.getItem(storageKey) ?? localStorage.getItem('rsi.competition.blueprint.v2');
    return { view: saved ? readView(JSON.parse(saved)) : researchTemplate(), note: '' };
  } catch {
    return { view: researchTemplate(), note: '未能读取浏览器草稿，已打开实时调研模板。' };
  }
}
const newId = (kind) => kind + '-' + crypto.randomUUID();
const templates = { blank: blankView, research: researchTemplate, branch: branchTemplate };

export default function Editor() {
  const [initial] = useState(loadDraft);
  const [view, setView] = useState(initial.view),
    current = useRef(view);
  const [note, setNote] = useState(initial.note);
  const diagram = useRef(null),
    uploader = useRef(null);
  const history = useRef({ past: [], future: [] });
  const [camera, setCamera] = useState(initialCamera);
  const [selection, select] = useState(null);
  const [menu, setMenu] = useState(null);
  const [preview, setPreview] = useState(null),
    pending = useRef(null);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [runs, setRuns] = useState({});
  const handlers = useRef(null);
  const node = view.elements.find((n) => n.id === selection?.node);
  const edge = view.links.find((e) => e.id === selection?.edge);

  function postStats() {
    const doc = current.current,
      count = (kind) => doc.elements.filter((n) => n.kind === kind).length;
    window.parent.postMessage(
      {
        type: 'competition-canvas',
        nodes: doc.elements.length,
        links: doc.links.length,
        modelNodes: count('extract'),
        liveSources: count('fetch'),
        useSnapshot: count('snapshot') > 0,
      },
      location.origin,
    );
  }
  function cancelWire() {
    pending.current = null;
    setPreview(null);
  }
  function put(doc) {
    current.current = doc;
    setView(doc);
    try {
      localStorage.setItem(storageKey, JSON.stringify(doc));
    } catch {
      setNote('浏览器未能保存草稿，可用“导出”保留本次编辑。');
    }
    postStats();
  }
  function commit(raw, message, { keepTrace = false } = {}) {
    if (busyRef.current) return false;
    try {
      const next = readView(raw);
      const log = history.current;
      log.past.push(current.current);
      if (log.past.length > historyLimit) log.past.shift();
      log.future = [];
      if (!keepTrace) setRuns({});
      setNote(message || '');
      put(next);
      return true;
    } catch (err) {
      setNote(err.message);
      return false;
    }
  }
  function moveNode(id, x, y) {
    const doc = current.current;
    const elements = doc.elements.map((item) => item.id === id ? { ...item, x, y } : item);
    commit({ ...doc, elements }, '', { keepTrace: true });
  }
  function travel(back) {
    if (busyRef.current) return;
    const log = history.current,
      from = back ? log.past : log.future,
      to = back ? log.future : log.past;
    if (!from.length) return;
    to.push(current.current);
    select(null);
    setMenu(null);
    cancelWire();
    setRuns({});
    setNote(back ? '已撤销。' : '已重做。');
    put(from.pop());
  }
  function replace(doc) {
    if (!commit(doc, '已打开流程，可撤销返回。')) return;
    setMenu(null);
    select(null);
    cancelWire();
    setCamera(initialCamera);
  }
  function inspectNode(id, move = false) {
    setMenu(null);
    select({ node: id, reveal: move });
  }
  function check() {
    try {
      const plan = compileGraph(current.current);
      setNote('校验通过，' + plan.order.length + ' 个节点可执行。');
    } catch (err) {
      if (err.nodeId) inspectNode(err.nodeId, true);
      setNote(err.message);
    }
  }
  function arrange() {
    const doc = current.current;
    if (!doc.elements.length) return;
    try {
      const layers = dependencyLayers(doc);
      const columnWidth = NODE_WIDTH + 65;
      const columns = Math.max(1, Math.floor((diagram.current.clientWidth - 30) / columnWidth));
      const positions = new Map();
      let bandTop = 30;
      for (let index = 0; index < layers.length; index += columns) {
        const band = layers.slice(index, index + columns);
        band.forEach((layer, column) =>
          layer.forEach((item, row) => {
            positions.set(item.id, {
              x: 30 + column * columnWidth,
              y: bandTop + row * (NODE_HEIGHT + 50),
            });
          }),
        );
        bandTop += Math.max(...band.map((layer) => layer.length)) * (NODE_HEIGHT + 50) + 38;
      }
      const elements = doc.elements.map((item) => ({ ...item, ...positions.get(item.id) }));
      if (commit({ ...doc, elements }, '已按依赖层排列节点。', { keepTrace: true })) {
        select(null);
        cancelWire();
        setCamera(initialCamera);
      }
    } catch (err) {
      setNote(err.message);
    }
  }
  function atWorld(x, y) {
    const area = diagram.current.getBoundingClientRect();
    return {
      x: Math.round((x - area.left - camera.x) / camera.scale),
      y: Math.round((y - area.top - camera.y) / camera.scale),
    };
  }
  function openMenu(x, y, options = {}) {
    if (busyRef.current) return;
    const world = options.world || atWorld(x, y);
    cancelWire();
    setMenu({ ...options, world, x, y });
  }
  function addMenu() {
    const box = diagram.current.getBoundingClientRect();
    const x = box.left + Math.min(box.width * 0.42, 420),
      y = box.top + Math.min(box.height * 0.36, 165);
    openMenu(x, y);
  }
  function addNode(kind) {
    if (!menu || busyRef.current) return;
    const doc = current.current,
      spec = nodeTypes[kind];
    const id = newId(kind);
    let { x, y } = menu.world;
    while (doc.elements.some((n) => Math.abs(n.x - x) < 32 && Math.abs(n.y - y) < 32)) {
      x += 32;
      y += 40;
    }
    const created = makeNode(kind, id, x, y);
    let next = {
      ...doc,
      elements: [...doc.elements, created],
      links: doc.links.filter((e) => e.id !== menu.edge?.id),
    };
    try {
      if (menu.from) {
        const into = spec.inputs.find((p) => p.type === menu.fromType);
        next = addConnection(next, makeLink(menu.from.node, menu.from.key, id, into.key));
      }
      if (menu.edge) {
        const out = spec.outputs.find((p) => p.type === menu.toType);
        next = addConnection(next, makeLink(id, out.key, menu.edge.toElementId, menu.edge.toPort));
      }
      if (commit(next, '已添加“' + created.name + '”。')) {
        inspectNode(id);
        setMenu(null);
      }
    } catch (err) {
      setNote(err.message);
    }
  }
  function insertOnWire() {
    if (!edge) return;
    const source = view.elements.find((n) => n.id === edge.fromElementId);
    const target = view.elements.find((n) => n.id === edge.toElementId);
    const out = outputPort(source, edge.fromPort);
    const box = diagram.current.getBoundingClientRect();
    openMenu(box.left + box.width * 0.45, box.top + 60, {
      from: { node: source.id, key: edge.fromPort },
      fromType: out.type,
      toType: out.type,
      edge,
      world: {
        x: Math.round((source.x + target.x) / 2),
        y: Math.round((source.y + target.y) / 2 + 110),
      },
    });
  }
  function updateNode(patch) {
    if (!node) return;
    commit(
      { ...view, elements: view.elements.map((n) => (n.id === node.id ? { ...n, ...patch } : n)) },
      '已更新节点。',
    );
  }
  function duplicate() {
    if (!node || ['start', 'end'].includes(node.kind)) return;
    const copy = makeNode(
      node.kind,
      newId(node.kind),
      node.x + 32,
      node.y + 120,
      node.name,
      node.settings,
    );
    if (commit({ ...view, elements: [...view.elements, copy] }, '已复制节点。'))
      inspectNode(copy.id);
  }
  function remove() {
    if (!node && !edge) return;
    const next = {
      ...view,
      elements: view.elements.filter((n) => n.id !== node?.id),
      links: view.links.filter(
        (e) => e.id !== edge?.id && e.fromElementId !== node?.id && e.toElementId !== node?.id,
      ),
    };
    if (commit(next, node ? '已删除节点及相连的线。' : '已断开连线。')) {
      select(null);
      cancelWire();
    }
  }
  function begin(id, port, button) {
    if (busyRef.current) return;
    const rect = button.querySelector('i').getBoundingClientRect();
    const x = rect.left + rect.width / 2,
      y = rect.top + rect.height / 2;
    pending.current = { node: id, key: port.key, type: port.type, x, y };
    setMenu(null);
    setPreview(pending.current);
    setNote('接到同色输入端口，或拖到空白处添加下一个节点。');
  }
  function finish(id, key) {
    const from = pending.current;
    if (!from || busyRef.current) return;
    cancelWire();
    try {
      const next = addConnection(current.current, makeLink(from.node, from.key, id, key));
      commit(next, '已连接两个端口。');
    } catch (err) {
      setNote(err.message);
    }
  }
  function endGesture(e) {
    const from = pending.current;
    if (!from || !e.isPrimary || e.button !== 0) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const pin = target?.closest('[data-pin-side]');
    if (pin?.dataset.pinSide === 'in') {
      finish(pin.dataset.pinNode, pin.dataset.pinKey);
      return;
    }
    if (pin?.dataset.pinNode === from.node && pin.dataset.pinKey === from.key) return;
    if (!target?.closest('.diagram') || target.closest('[data-node],[data-wire]')) {
      cancelWire();
      return;
    }
    openMenu(e.clientX, e.clientY, { from, fromType: from.type });
  }
  function exportFile() {
    const doc = current.current;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.title + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || busyRef.current) return;
    try {
      if (file.size > 384 * 1024) throw Error('流程文件超过 384 KB。');
      const raw = JSON.parse(await file.text());
      replace(readView(raw.view || raw));
    } catch (err) {
      setNote('导入失败。' + err.message);
    }
  }
  function hostMessage(e) {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    if (e.data?.type === 'competition-canvas-query') {
      postStats();
      return;
    }
    if (e.data?.type !== 'competition-run') return;
    const event = e.data.event;
    if (event.type === 'reset') {
      cancelWire();
      setMenu(null);
      setRuns({});
      setNote('');
      busyRef.current = true;
      setBusy(true);
    } else if (event.type === 'done' || event.type === 'clear') {
      busyRef.current = false;
      setBusy(false);
      if (event.type === 'clear') setRuns({});
      else if (event.interruption)
        setRuns((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([id, entry]) => [
              id,
              entry.status === 'running'
                ? { ...entry, status: 'interrupted', detail: event.interruption }
                : entry,
            ]),
          ),
        );
    } else if (event.type === 'invalid') {
      if (event.nodeId) inspectNode(event.nodeId, true);
      setNote(event.detail);
    } else if (['started', 'stage', 'failed'].includes(event.type)) {
      setRuns((prev) => ({
        ...prev,
        [event.id]: { ...event, status: event.type === 'started' ? 'running' : event.status },
      }));
    }
  }
  handlers.current = {
    hostMessage,
    endGesture,
    postStats,
    key(e) {
      if (e.key === 'Escape') {
        setMenu(null);
        cancelWire();
        return;
      }
      if (e.target.closest?.('input,select,textarea,[contenteditable="true"]') || busyRef.current)
        return;
      const mod = e.ctrlKey || e.metaKey,
        key = e.key.toLowerCase();
      if (mod && (key === 'z' || key === 'y')) {
        e.preventDefault();
        travel(key === 'z' && !e.shiftKey);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      } else if (mod && key === 's') {
        e.preventDefault();
        exportFile();
      }
    },
  };
  useEffect(() => {
    window.getCompetitionView = () => clone(current.current);
    const message = (e) => handlers.current.hostMessage(e);
    const up = (e) => handlers.current.endGesture(e);
    const key = (e) => handlers.current.key(e);
    const blur = cancelWire;
    window.addEventListener('message', message);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', blur);
    window.addEventListener('pointercancel', blur);
    handlers.current.postStats();
    return () => {
      delete window.getCompetitionView;
      window.removeEventListener('message', message);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointercancel', blur);
    };
  }, []);
  const board = {
    busy,
    runs,
    selected: node?.id || edge?.id,
    pendingType: preview?.type,
    begin,
    finish,
    selectNode: inspectNode,
    selectWire(id) {
      setMenu(null);
      cancelWire();
      select({ edge: id });
    },
  };
  return (
    <div
      className="editor flow-appearance"
      onPointerDownCapture={(e) => {
        if (menu && !e.target.closest('.picker')) setMenu(null);
        if (pending.current && !e.target.closest('[data-pin-side],.diagram')) cancelWire();
      }}
    >
      <div className="bar" role="group" aria-label="画布工具">
        <fieldset disabled={busy} className="bar-main" aria-label="编辑流程">
          <select
            aria-label="新建或切换模板"
            value=""
            onChange={(e) => {
              if (templates[e.target.value]) replace(templates[e.target.value]());
            }}
          >
            <option value="" disabled>
              新建 / 模板
            </option>
            <option value="blank">空白画布</option>
            <option value="research">实时赛事调研</option>
            <option value="branch">历史赛事分流</option>
          </select>
          <button className="add" onClick={addMenu}>
            <span aria-hidden="true" className="add-symbol">
              +
            </span>
            添加节点
          </button>
          <div className="tool-segment" role="group" aria-label="编辑历史">
            <button
              disabled={!history.current.past.length}
              onClick={() => travel(true)}
              aria-label="撤销"
              title="撤销（Ctrl+Z）"
            >
              <span className="history-symbol" aria-hidden="true">
                ↶
              </span>
              <span className="history-label">撤销</span>
            </button>
            <button
              disabled={!history.current.future.length}
              onClick={() => travel(false)}
              aria-label="重做"
              title="重做（Ctrl+Y）"
            >
              <span className="history-symbol" aria-hidden="true">
                ↷
              </span>
              <span className="history-label">重做</span>
            </button>
          </div>
          <button onClick={arrange} disabled={!view.elements.length}>
            整理布局
          </button>
          <button onClick={check}>校验</button>
        </fieldset>
        <div className="bar-files">
          <button
            onClick={() => {
              select((item) => (item?.reveal ? { node: item.node } : item));
              setCamera(initialCamera);
            }}
            title="恢复初始缩放和视口"
          >
            视口归位
          </button>
          <div className="tool-segment" role="group" aria-label="流程文件">
            <button disabled={busy} onClick={() => uploader.current.click()}>
              导入
            </button>
            <button onClick={exportFile}>导出</button>
          </div>
          <input
            hidden
            ref={uploader}
            type="file"
            accept=".json,application/json"
            onChange={importFile}
          />
        </div>
      </div>
      <div className="board-area">
        <div
          className="diagram"
          ref={diagram}
          onPointerDownCapture={(e) => {
            if (e.button === 0 && !e.target.closest('[data-node],[data-wire],.zoom-controls'))
              select(null);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!e.target.closest('[data-node],[data-wire]')) openMenu(e.clientX, e.clientY);
          }}
        >
          <Board.Provider value={board}>
            <FlowDiagram
              view={view}
              viewport={diagram}
              camera={camera}
              changeCamera={setCamera}
              moveNode={moveNode}
              reveal={selection?.reveal ? selection : null}
            />
          </Board.Provider>
        </div>
        {!view.elements.length && !menu && (
          <div className="empty-board">
            <strong>从一个“开始”节点搭起</strong>
            <button disabled={busy} onClick={addMenu}>
              打开节点库
            </button>
          </div>
        )}
        <Inspector
          key={node?.id || edge?.id || 'nothing'}
          node={node}
          edge={edge}
          view={view}
          receipt={node && runs[node.id]}
          busy={busy}
          update={updateNode}
          remove={remove}
          insert={insertOnWire}
          duplicate={duplicate}
          close={() => select(null)}
        />
      </div>
      <footer>
        <fieldset disabled={busy}>
          <label className="flow-name">
            <span>流程名称</span>
            <EditText
              label="流程名称"
              maxLength={80}
              value={view.title}
              save={(title) =>
                commit({ ...current.current, title }, '已更新流程名称。', { keepTrace: true })
              }
            />
          </label>
        </fieldset>
        <span role="status">{note || '从右侧圆点拖向左侧圆点连线，拖动空白处平移。'}</span>
      </footer>
      {preview && <ConnectionPreview from={preview} />}
      {menu && (
        <NodeMenu
          key={menu.x + '-' + menu.y + '-' + (menu.from?.node || '')}
          menu={menu}
          view={view}
          pick={addNode}
          close={() => setMenu(null)}
        />
      )}
    </div>
  );
}
