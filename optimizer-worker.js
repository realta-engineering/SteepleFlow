const BLOCKED_PARTICIPANT_ID = "__blocked__";

self.onmessage = event => {
  if (event.data?.type !== "optimize") return;
  try {
    runOptimization(event.data.payload);
  } catch (error) {
    self.postMessage({ type: "error", error: error.message || "Genetic optimization failed." });
  }
};

function runOptimization(payload) {
  const cycle = payload.cycle;
  const participants = payload.participants || [];
  const assignments = payload.assignments || [];
  const frozenRoles = new Set(payload.frozenRoles || []);
  const generations = clamp(Number(payload.generations) || 500, 10, 5000);
  const populationSize = clamp(Number(payload.populationSize) || 40, 20, 80);
  const participantMap = new Map(participants.map(person => [person.id, person]));
  const dateIndex = new Map(cycle.dates.map((date, index) => [date, index]));
  const slotKey = (date, role) => `${date}\u0000${role}`;
  const validAssignment = assignment => cycle.dates.includes(assignment.date) && cycle.roles.includes(assignment.role);
  const fixed = assignments.filter(assignment => validAssignment(assignment) && (
    assignment.locked || frozenRoles.has(assignment.role) || participantMap.get(assignment.participantId)?.autoAssign === false
  ));
  const fixedSlots = new Set(fixed.map(assignment => slotKey(assignment.date, assignment.role)));
  const fixedUsedByDate = new Map(cycle.dates.map(date => [date, new Set()]));
  fixed.forEach(assignment => {
    if (assignment.participantId !== BLOCKED_PARTICIPANT_ID) fixedUsedByDate.get(assignment.date)?.add(assignment.participantId);
  });
  const slots = [];
  cycle.dates.forEach(date => cycle.roles.forEach(role => {
    if (!frozenRoles.has(role) && !fixedSlots.has(slotKey(date, role))) slots.push({ date, role });
  }));
  const candidates = slots.map(slot => participants.filter(person =>
    person.submitted !== false && person.autoAssign !== false && person.roles.includes(slot.role) &&
    !person.unavailable.includes(slot.date) && !fixedUsedByDate.get(slot.date)?.has(person.id)
  ).map(person => person.id));
  const currentBySlot = new Map(assignments.filter(validAssignment).map(assignment => [slotKey(assignment.date, assignment.role), assignment.participantId]));
  const currentGenes = slots.map((slot, index) => candidates[index].includes(currentBySlot.get(slotKey(slot.date, slot.role))) ? currentBySlot.get(slotKey(slot.date, slot.role)) : null);
  const totalPositions = cycle.dates.length * cycle.roles.length - assignments.filter(assignment => assignment.participantId === BLOCKED_PARTICIPANT_ID && validAssignment(assignment)).length;

  const evaluate = genes => {
    const scheduled = fixed.filter(assignment => assignment.participantId !== BLOCKED_PARTICIPANT_ID).map(assignment => ({ date: assignment.date, role: assignment.role, participantId: assignment.participantId }));
    genes.forEach((participantId, index) => { if (participantId) scheduled.push({ ...slots[index], participantId }); });
    const loads = Object.fromEntries(participants.map(person => [person.id, 0]));
    const rolesByPerson = new Map(participants.map(person => [person.id, new Map()]));
    const datesByPerson = new Map(participants.map(person => [person.id, new Set()]));
    scheduled.forEach(item => {
      loads[item.participantId] = (loads[item.participantId] || 0) + 1;
      const roleCounts = rolesByPerson.get(item.participantId) || new Map();
      roleCounts.set(item.role, (roleCounts.get(item.role) || 0) + 1);
      rolesByPerson.set(item.participantId, roleCounts);
      const dates = datesByPerson.get(item.participantId) || new Set();
      dates.add(dateIndex.get(item.date));
      datesByPerson.set(item.participantId, dates);
    });
    const values = Object.values(loads);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0);
    const loadSpread = values.length ? Math.max(...values) - Math.min(...values) : 0;
    let consecutive = 0, roleRepeats = 0;
    datesByPerson.forEach(dates => {
      const ordered = [...dates].sort((a, b) => a - b);
      for (let index = 1; index < ordered.length; index++) if (ordered[index] === ordered[index - 1] + 1) consecutive++;
    });
    rolesByPerson.forEach(roleCounts => roleCounts.forEach(count => { if (count > 1) roleRepeats += count - 1; }));
    const changes = genes.reduce((count, participantId, index) => count + (participantId !== currentGenes[index] ? 1 : 0), 0);
    const filled = scheduled.length;
    return { filled, total: totalPositions, coverage: totalPositions ? Math.round(filled / totalPositions * 100) : 100, loadSpread, variance, consecutive, roleRepeats, changes };
  };
  const compareMetrics = (left, right) => left.filled - right.filled || right.variance - left.variance || right.consecutive - left.consecutive || right.roleRepeats - left.roleRepeats || right.changes - left.changes;
  const makeCandidate = genes => ({ genes, metrics: evaluate(genes) });

  const repair = (source, randomize = false, fillEmpty = true) => {
    const output = Array(slots.length).fill(null);
    const usedByDate = new Map([...fixedUsedByDate].map(([date, ids]) => [date, new Set(ids)]));
    const loads = Object.fromEntries(participants.map(person => [person.id, fixed.filter(item => item.participantId === person.id).length]));
    const orderedIndices = slots.map((_, index) => index).sort((a, b) => candidates[a].length - candidates[b].length || a - b);
    if (!fillEmpty) return output;
    orderedIndices.forEach(index => {
      const proposed = source[index];
      if (proposed && candidates[index].includes(proposed) && !usedByDate.get(slots[index].date).has(proposed)) {
        output[index] = proposed;
        usedByDate.get(slots[index].date).add(proposed);
        loads[proposed] = (loads[proposed] || 0) + 1;
      }
    });
    orderedIndices.forEach(index => {
      if (output[index]) return;
      const available = candidates[index].filter(id => !usedByDate.get(slots[index].date).has(id));
      if (!available.length) return;
      available.sort((a, b) => (loads[a] || 0) - (loads[b] || 0) || (randomize ? Math.random() - .5 : String(a).localeCompare(String(b))));
      const shortlist = randomize ? available.slice(0, Math.min(3, available.length)) : available;
      const chosen = shortlist[randomize ? Math.floor(Math.random() * shortlist.length) : 0];
      output[index] = chosen;
      usedByDate.get(slots[index].date).add(chosen);
      loads[chosen] = (loads[chosen] || 0) + 1;
    });
    return output;
  };

  const greedyGenes = repair(Array(slots.length).fill(null), false);
  const randomGenes = () => repair(slots.map((_, index) => candidates[index].length && Math.random() > .2 ? candidates[index][Math.floor(Math.random() * candidates[index].length)] : null), true);
  const population = [makeCandidate(repair(currentGenes, false)), makeCandidate(greedyGenes)];
  while (population.length < populationSize) population.push(makeCandidate(randomGenes()));

  const tournament = members => {
    let winner = members[Math.floor(Math.random() * members.length)];
    for (let count = 1; count < 4; count++) {
      const challenger = members[Math.floor(Math.random() * members.length)];
      if (compareMetrics(challenger.metrics, winner.metrics) > 0) winner = challenger;
    }
    return winner;
  };
  const crossover = (left, right) => {
    const sourceByDate = new Map(cycle.dates.map(date => [date, Math.random() < .5 ? left : right]));
    return slots.map((slot, index) => sourceByDate.get(slot.date).genes[index]);
  };
  const mutate = genes => {
    const next = [...genes];
    const mutations = 1 + Math.floor(Math.random() * Math.min(3, Math.max(1, slots.length)));
    for (let count = 0; count < mutations && slots.length; count++) {
      const index = Math.floor(Math.random() * slots.length);
      const options = [null, ...candidates[index]];
      next[index] = options[Math.floor(Math.random() * options.length)];
    }
    return next;
  };

  let members = population;
  const progressEvery = Math.max(1, Math.floor(generations / 100));
  for (let generation = 1; generation <= generations; generation++) {
    members.sort((a, b) => compareMetrics(b.metrics, a.metrics));
    const next = members.slice(0, 4).map(candidate => makeCandidate([...candidate.genes]));
    while (next.length < populationSize) {
      const left = tournament(members), right = tournament(members);
      let genes = Math.random() < .85 ? crossover(left, right) : [...left.genes];
      if (Math.random() < .35) genes = mutate(genes);
      next.push(makeCandidate(repair(genes, true)));
    }
    members = next;
    if (generation === 1 || generation === generations || generation % progressEvery === 0) {
      members.sort((a, b) => compareMetrics(b.metrics, a.metrics));
      self.postMessage({ type: "progress", generation, generations, metrics: members[0].metrics });
    }
  }
  members.sort((a, b) => compareMetrics(b.metrics, a.metrics));
  const best = members[0];
  const proposed = fixed.map(assignment => ({ date: assignment.date, role: assignment.role, participantId: assignment.participantId, locked: !!assignment.locked, id: assignment.id }));
  best.genes.forEach((participantId, index) => { if (participantId) proposed.push({ ...slots[index], participantId, locked: false }); });
  self.postMessage({ type: "complete", assignments: proposed, metrics: best.metrics, currentMetrics: evaluate(repair(currentGenes, false, false)), generations });
}

function clamp(value, minimum, maximum) { return Math.min(Math.max(value, minimum), maximum); }
