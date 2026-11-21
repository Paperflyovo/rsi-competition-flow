import { randomUUID } from 'node:crypto';
import { compileGraph } from './graph.mjs';
import { directions, nodeTypes } from './nodes.mjs';
import { portStats, researchOperations, uniqueRows } from './operations.mjs';
import { readProviderOverride } from './providers.mjs';

export function prepareResearch(request) {
  const plan = compileGraph(request?.view);
  const picks = request?.directions;
  if (
    !Array.isArray(picks) ||
    !picks.length ||
    picks.length > directions.length ||
    picks.some((tag) => !directions.includes(tag))
  )
    throw Error('请选择有效的调研方向。');
  const usesModel = plan.order.some((node) => node.kind === 'extract');
  const provider = usesModel ? readProviderOverride(request.provider) : undefined;
  return { plan, directions: [...new Set(picks)], provider };
}

function inputsFor(node, incoming, outputs) {
  const inputs = {};
  for (const port of nodeTypes[node.kind].inputs) {
    const values = incoming
      .filter((edge) => edge.toPort === port.key)
      .map((edge) => outputs.get(edge.fromElementId)[edge.fromPort])
      .filter((value) => value !== undefined);
    if (port.many) inputs[port.key] = values;
    else if (values.length) inputs[port.key] = values[0];
  }
  return inputs;
}

export async function runPreparedResearch(prepared, notify = () => {}, signal) {
  const { plan } = prepared;
  const started = new Date();
  const beijing = new Date(+started + 8 * 3600000);
  beijing.setUTCFullYear(beijing.getUTCFullYear() + 1);
  const input = {
    audience: '独立开发者和小型团队',
    directions: prepared.directions,
    startedAt: started.toISOString(),
    windowEndsAt: new Date(+beijing - 8 * 3600000).toISOString(),
  };
  const operations = researchOperations(input, signal, prepared.provider);
  const outputs = new Map(),
    trace = [];
  for (const node of plan.order) {
    signal?.throwIfAborted();
    const spec = nodeTypes[node.kind];
    const inputs = inputsFor(node, plan.incoming.get(node.id), outputs);
    const at = Date.now();
    const entry = {
      id: node.id,
      kind: node.kind,
      title: node.name,
      startedAt: new Date(at).toISOString(),
      inputs: spec.inputs.map((port) => portStats(port, inputs[port.key])),
    };
    const skipped = node.kind !== 'start' && node.kind !== 'end' && !Object.keys(inputs).length;
    try {
      let result;
      if (skipped) {
        result = { outputs: {}, detail: '上游分支没有记录，已跳过。' };
        if (node.kind === 'publish')
          result.outputs.out = { id: node.id, title: node.name, rows: [] };
      } else {
        notify({ type: 'started', ...entry });
        result = await operations.actions[node.kind](node, inputs);
      }
      outputs.set(node.id, result.outputs);
      Object.assign(entry, {
        status: skipped ? 'skipped' : 'success',
        detail: result.detail,
        elapsedMs: Date.now() - at,
        outputs: spec.outputs.map((port) => portStats(port, result.outputs[port.key])),
      });
      trace.push(entry);
      notify({ type: 'stage', ...entry });
    } catch (error) {
      notify({
        type: 'failed',
        ...entry,
        status: 'failed',
        detail: error.message,
        elapsedMs: Date.now() - at,
      });
      throw error;
    }
  }
  const groups = operations.getGroups(),
    provenance = operations.provenance;
  const mode = provenance.snapshot ? (provenance.live ? 'mixed' : 'snapshot') : 'live';
  return {
    runId: randomUUID(),
    mode,
    input,
    groups,
    rows: uniqueRows(groups.flatMap((group) => group.rows)),
    order: plan.order
      .filter((node) => node.kind !== 'start' && node.kind !== 'end')
      .map((node) => node.id),
    model: operations.modelCalls[0] ?? null,
    modelCalls: operations.modelCalls,
    provenance,
    engine: 'competition-flow',
    trace,
    view: plan.view,
    graph: {
      nodes: plan.view.elements.map((e) => e.id),
      routes: plan.view.links.map((e) => [e.fromElementId, e.toElementId]),
    },
    finishedAt: new Date().toISOString(),
  };
}

// Also accepts v1 canvas snapshots saved by earlier callers.
export function runResearch(request, notify, signal) {
  return runPreparedResearch(prepareResearch(request), notify, signal);
}
