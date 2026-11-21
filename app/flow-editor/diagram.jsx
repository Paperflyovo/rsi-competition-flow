import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { nodeTypes, nodeSummary, portTypes } from '../../src/research/nodes.mjs';

export const Board = createContext(null);
export const NODE_WIDTH = 162;
export const NODE_HEIGHT = 94;
const pinY = (index) => 51 + index * 23;
export const stateText = {
  running: '运行中',
  success: '完成',
  skipped: '跳过',
  failed: '失败',
  interrupted: '中断',
};

const actionSymbols = {
  start: '▶︎',
  discover: '◎',
  fetch: '↓',
  extract: '✦',
  audit: '✓',
  snapshot: '◷',
  filter: '▽',
  rank: '↕',
  limit: '⋯',
  publish: '▤',
  end: '■',
};

export function portColor(type) {
  return 'var(--port-' + type + ', ' + portTypes[type][1] + ')';
}

export function NodeMark({ kind }) {
  const spec = nodeTypes[kind];
  const type = (spec.outputs[0] || spec.inputs[0]).type;
  return (
    <span
      aria-hidden="true"
      className="node-mark"
      data-action={kind}
      style={{ '--tint': portColor(type) }}
    >
      {actionSymbols[kind]}
    </span>
  );
}

export const initialCamera = { x: 0, y: 0, scale: 1 };

function zoomAt(camera, factor, x, y) {
  const scale = Math.max(0.25, Math.min(3, camera.scale * factor));
  const ratio = scale / camera.scale;
  // Keep the same world point under the cursor while zooming.
  return { scale, x: x + (camera.x - x) * ratio, y: y + (camera.y - y) * ratio };
}

export function FlowDiagram({ view, viewport, camera, changeCamera, reveal, moveNode }) {
  const board = useContext(Board);
  const gesture = useRef(null);
  const [preview, setPreview] = useState(null);
  const nodes = new Map(view.elements.map((node) => [node.id, node]));
  if (preview && nodes.has(preview.id)) {
    nodes.set(preview.id, { ...nodes.get(preview.id), ...preview });
  }

  useEffect(() => {
    const area = viewport.current;
    function wheel(event) {
      event.preventDefault();
      if (gesture.current || !event.deltaY) return;
      const bounds = area.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
      const distance = Math.max(-240, Math.min(240, event.deltaY * units));
      changeCamera((current) => zoomAt(current, Math.exp(-distance * 0.002), x, y));
    }
    function cancel() {
      gesture.current = null;
      setPreview(null);
    }
    area.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('blur', cancel);
    return () => {
      area.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', cancel);
    };
  }, [viewport, changeCamera]);

  useLayoutEffect(() => {
    if (!reveal) return;
    const area = viewport.current;
    const box = area.querySelector('[data-node="' + reveal.node + '"]')?.getBoundingClientRect();
    if (!box) return;
    const bounds = area.getBoundingClientRect();
    const panel = area.parentElement.querySelector('.inspector')?.getBoundingClientRect();
    const sidePanel = panel && panel.left > bounds.left + 8 && panel.top < bounds.bottom - 1;
    const right = sidePanel ? Math.min(bounds.right, panel.left - 8) : bounds.right;
    if (box.left >= bounds.left && box.right <= right && box.top >= bounds.top && box.bottom <= bounds.bottom) return;
    changeCamera((current) => ({
      ...current,
      x: current.x + (bounds.left + right - box.left - box.right) / 2,
      y: current.y + (bounds.top + bounds.bottom - box.top - box.bottom) / 2,
    }));
  }, [reveal, viewport, changeCamera]);

  function startGesture(event) {
    if (!event.isPrimary || gesture.current || (event.button !== 0 && event.button !== 1)) return;
    if (event.target.closest('button,[data-wire]') || board.pendingType) return;
    const nodeId = event.button === 0 ? event.target.closest('[data-node]')?.dataset.node : undefined;
    const node = nodes.get(nodeId);
    if (node) {
      board.selectNode(nodeId);
      if (board.busy) return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      node,
      camera,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function updateGesture(event, finish = false) {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (finish) gesture.current = null;
    if (drag.node) {
      const x = Math.round(drag.node.x + dx / drag.camera.scale);
      const y = Math.round(drag.node.y + dy / drag.camera.scale);
      if (finish) {
        setPreview(null);
        if (!board.busy && (x !== drag.node.x || y !== drag.node.y)) moveNode(drag.node.id, x, y);
      } else if (!board.busy) {
        setPreview({ id: drag.node.id, x, y });
      }
    } else {
      changeCamera({ ...drag.camera, x: drag.camera.x + dx, y: drag.camera.y + dy });
    }
  }

  function cancelGesture(event) {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    setPreview(null);
  }
  function zoomCenter(factor) {
    const { width, height } = viewport.current.getBoundingClientRect();
    changeCamera((current) => zoomAt(current, factor, width / 2, height / 2));
  }
  return (
    <div
      className="canvas-viewport"
      style={{
        backgroundSize: (20 * camera.scale) + 'px ' + (20 * camera.scale) + 'px',
        backgroundPosition: camera.x + 'px ' + camera.y + 'px',
      }}
      onPointerDown={startGesture}
      onPointerMove={updateGesture}
      onPointerUp={(event) => updateGesture(event, true)}
      onPointerCancel={cancelGesture}
      onLostPointerCapture={cancelGesture}
    >
      <svg className="canvas-wires" width="100%" height="100%" aria-label="节点连线">
        <g transform={'translate(' + camera.x + ' ' + camera.y + ') scale(' + camera.scale + ')'}>
          {view.links.map((edge) => (
            <Wire key={edge.id} edge={edge}
              from={nodes.get(edge.fromElementId)} to={nodes.get(edge.toElementId)} />
          ))}
        </g>
      </svg>
      <div
        className="canvas-world"
        style={{ transform: 'translate(' + camera.x + 'px,' + camera.y + 'px) scale(' + camera.scale + ')' }}
      >
        {[...nodes.values()].map((node) => (
          <div key={node.id} className="canvas-card" style={{ left: node.x, top: node.y }}>
            <Stage node={node} />
          </div>
        ))}
      </div>
      <div className="zoom-controls" role="group" aria-label="画布缩放">
        <button type="button" aria-label="放大" onClick={() => zoomCenter(1.2)}>+</button>
        <button type="button" aria-label="缩小" onClick={() => zoomCenter(1 / 1.2)}>−</button>
      </div>
    </div>
  );
}

export function wirePath(x1, y1, x2, y2) {
  if (x2 >= x1 + 12) {
    const bend = Math.max(22, (x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  }
  const mid = Math.abs(y2 - y1) < 55 ? Math.max(y1, y2) + 66 : (y1 + y2) / 2;
  return [
    `M ${x1} ${y1}`,
    `C ${x1 + 40} ${y1}, ${x1 + 40} ${mid}, ${x1 + 8} ${mid}`,
    `L ${x2 - 8} ${mid}`,
    `C ${x2 - 40} ${mid}, ${x2 - 40} ${y2}, ${x2} ${y2}`,
  ].join(' ');
}

export function ConnectionPreview({ from }) {
  const path = useRef(null);
  useEffect(() => {
    const move = (e) =>
      path.current?.setAttribute('d', wirePath(from.x, from.y, e.clientX, e.clientY));
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [from]);
  return (
    <svg className="ghost-wire" aria-hidden="true">
      <path
        ref={path}
        d={wirePath(from.x, from.y, from.x + 1, from.y)}
        fill="none"
        stroke={portColor(from.type)}
        strokeWidth="2"
        strokeDasharray="5 3"
      />
    </svg>
  );
}

function Stage({ node }) {
  const board = useContext(Board);
  const def = nodeTypes[node.kind];
  const status = board.runs[node.id]?.status;
  function socket(port, i, side) {
    const isOut = side === 'out';
    return (
      <button
        type="button"
        key={port.key}
        className={
          'socket ' + side + (!isOut && board.pendingType === port.type ? ' compatible' : '')
        }
        style={{ top: pinY(i), '--pin': portColor(port.type) }}
        data-pin-side={side}
        data-pin-key={port.key}
        data-pin-node={node.id}
        title={node.name + ' · ' + (isOut ? '输出' : '输入') + ' · ' + port.label}
        aria-label={node.name + (isOut ? '输出' : '输入') + port.label}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.isPrimary && e.button === 0 && isOut) {
            e.currentTarget.setPointerCapture(e.pointerId);
            board.begin(node.id, port, e.currentTarget);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!isOut) board.finish(node.id, port.key);
          else if (e.detail === 0) board.begin(node.id, port, e.currentTarget);
        }}
      >
        <i />
        <span>{port.label}</span>
      </button>
    );
  }
  return (
    <div
      className={
        'flow-node' + (board.selected === node.id ? ' selected' : '') + (status ? ' ' + status : '')
      }
      data-node={node.id}
      role="group"
      aria-label={node.name}
      title={node.name}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }}
    >
      <div className="node-title">
        <NodeMark kind={node.kind} />
        <div className="node-heading">
          <strong>{node.name}</strong>
          <small>{status ? stateText[status] : def.group}</small>
        </div>
      </div>
      {def.inputs.map((p, i) => socket(p, i, 'in'))}
      {def.outputs.map((p, i) => socket(p, i, 'out'))}
      {def.inputs.length < 2 && def.outputs.length < 2 && (
        <div className="node-detail">{nodeSummary(node)}</div>
      )}
    </div>
  );
}

function Wire({ edge, from, to }) {
  const board = useContext(Board);
  if (!from || !to) return null;
  const outs = nodeTypes[from.kind].outputs, ins = nodeTypes[to.kind].inputs;
  const a = outs.findIndex((p) => p.key === edge.fromPort);
  const b = ins.findIndex((p) => p.key === edge.toPort);
  if (a < 0 || b < 0) return null;
  const targetX = to.x, targetY = to.y + pinY(b);
  const path = wirePath(from.x + NODE_WIDTH, from.y + pinY(a), targetX, targetY);
  const selected = board.selected === edge.id;
  const stroke = portColor(outs[a].type);
  const receipt = board.runs[edge.fromElementId]?.outputs?.find((p) => p.key === edge.fromPort);
  return (
    <g
      data-wire={edge.id}
      style={{ color: stroke }}
      className={
        'wire' + (selected ? ' selected' : '') + (receipt && !receipt.active ? ' dormant' : '')
      }
    >
      {selected && <path className="wire-halo" d={path} />}
      <path className="wire-line" d={path} stroke="currentColor" />
      <path
        d={['M', targetX - 14, targetY - 3, 'l', 5, 3, -5, 3].join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        pointerEvents="none"
      />
      <path
        d={path}
        className="wire-hit"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (e.isPrimary && e.button === 0) board.selectWire(edge.id);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <title>
          {from.name} → {to.name}
        </title>
      </path>
    </g>
  );
}
