// Technical feasibility spike. Synthetic rules; no LLM, API, or production claims.
export function makeModel(salePrice = 5) {
  return {
    resources: ['gold', 'wood', 'blade'],
    initial: { gold: 4, wood: 0, blade: 0 },
    objectiveResource: 'gold',
    actions: [
      { id: 'buy', label: '用 4 金币购买 2 木材', cost: { gold: 4 }, gain: { wood: 2 } },
      { id: 'craft', label: '用 2 木材制作 1 刀剑', cost: { wood: 2 }, gain: { blade: 1 } },
      { id: 'sell', label: '出售 1 刀剑，获得 ' + salePrice + ' 金币', cost: { blade: 1 }, gain: { gold: salePrice } },
    ],
  };
}

function validate(model) {
  if (!model.resources.length || new Set(model.resources).size !== model.resources.length) {
    throw new Error('Resources must be nonempty and unique');
  }
  if (!model.resources.includes(model.objectiveResource)) throw new Error('Unknown objective');
  const vectors = [model.initial, ...model.actions.flatMap(a => [a.cost, a.gain])];
  for (const vector of vectors) {
    for (const [key, value] of Object.entries(vector)) {
      if (!model.resources.includes(key) || !Number.isSafeInteger(value) || value < 0) {
        throw new Error('Resource vectors require known keys and nonnegative safe integers');
      }
    }
  }
  for (const resource of model.resources) {
    if (!Object.hasOwn(model.initial, resource)) throw new Error('Incomplete initial state');
  }
  if (new Set(model.actions.map(a => a.id)).size !== model.actions.length) throw new Error('Duplicate action IDs');
}

function transition(model, state, action) {
  if (Object.entries(action.cost).some(([key, value]) => state[key] < value)) return null;
  const next = Object.fromEntries(model.resources.map(key => [
    key, state[key] - (action.cost[key] ?? 0) + (action.gain[key] ?? 0),
  ]));
  if (Object.values(next).some(v => !Number.isSafeInteger(v))) throw new Error('Resource overflow');
  return next;
}

export function violatesContract(model, state) {
  // Only this explicit contract: restored non-gold inventory, but more gold.
  return state[model.objectiveResource] > model.initial[model.objectiveResource]
    && model.resources.filter(r => r !== model.objectiveResource)
      .every(r => state[r] === model.initial[r]);
}

export function replay(model, actionIds) {
  validate(model);
  let state = { ...model.initial };
  const trace = [{ step: 0, action: null, state }];
  for (const id of actionIds) {
    const action = model.actions.find(a => a.id === id);
    if (!action) throw new Error('Unknown action: ' + id);
    const next = transition(model, state, action);
    if (!next) throw new Error('Action has insufficient resources: ' + id);
    state = next;
    trace.push({ step: trace.length, action: id, label: action.label, state });
  }
  return { trace, violates: violatesContract(model, state) };
}

export function search(model, { maxDepth = 12, maxStates = 10000 } = {}) {
  validate(model);
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0
    || !Number.isSafeInteger(maxStates) || maxStates < 1) throw new Error('Invalid search bounds');
  const keyOf = state => JSON.stringify(model.resources.map(r => state[r]));
  const queue = [{ state: { ...model.initial }, actions: [] }];
  const seen = new Set([keyOf(model.initial)]);
  const scope = { maxDepth, maxStates, semantics: 'memoryless nonnegative integer resource transitions' };
  let expanded = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (violatesContract(model, current.state)) {
      return { status: 'counterexample', shortestWithinModel: true, scope,
        visited: seen.size, expanded, actions: current.actions, ...replay(model, current.actions) };
    }
    if (current.actions.length >= maxDepth) continue;
    expanded++;
    for (const action of model.actions) {
      const next = transition(model, current.state, action);
      if (!next) continue;
      const key = keyOf(next);
      if (seen.has(key)) continue;
      if (seen.size >= maxStates) {
        return { status: 'inconclusive', reason: 'state budget reached', scope, visited: seen.size, expanded };
      }
      seen.add(key);
      queue.push({ state: next, actions: [...current.actions, action.id] });
    }
  }
  return { status: 'no-counterexample-within-bound', scope, visited: seen.size, expanded };
}
