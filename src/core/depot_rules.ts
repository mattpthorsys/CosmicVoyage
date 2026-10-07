import { getTradeItemInfo } from './starbase_commerce';
import type { DepotQuoteInputs, DepotServiceQuote, DepotWorkTarget } from './depot_types';

interface SupplyAllocation {
  readonly station: Record<string, number>;
  readonly cargo: Record<string, number>;
  readonly cost: number;
}

/** Allocates sealed batches station-first; ship supplies supplement shortages only with explicit consent. */
function allocateSupplies(
  target: DepotWorkTarget,
  units: number,
  inputs: DepotQuoteInputs,
  stock: Readonly<Record<string, number>>,
  cargo: Readonly<Record<string, number>>
): SupplyAllocation | null {
  const batches = Math.ceil(units / target.unitsPerBatch);
  const station: Record<string, number> = {};
  const carried: Record<string, number> = {};
  let cost = units * target.labourPerUnit;
  for (const key of target.supplies) {
    const fromStation = Math.min(batches, Math.floor(stock[key] ?? 0));
    let remaining = batches - fromStation;
    if (fromStation > 0) station[key] = fromStation;
    // Legacy mined deuterium and packaged pellets are interchangeable reactor inputs, not duplicate stock.
    const cargoKeys = key === 'DEUTERIUM_PELLETS' ? ['DEUTERIUM', key] : [key];
    for (const cargoKey of cargoKeys) {
      const supplied = inputs.useCargo ? Math.min(remaining, Math.floor(cargo[cargoKey] ?? 0)) : 0;
      if (supplied > 0) carried[cargoKey] = supplied;
      remaining -= supplied;
    }
    if (remaining > 0) return null;
    cost += fromStation * (inputs.prices[key] ?? 0);
  }
  return { station, cargo: carried, cost: Math.ceil(cost) };
}

/** Quotes the greatest affordable supported work without looping over every damage or fuel point. */
export function quoteDepotWork(inputs: DepotQuoteInputs): DepotServiceQuote {
  const selected =
    inputs.targetId === 'all'
      ? inputs.targets
      : inputs.targets.filter((target) => target.id === inputs.targetId);
  const stock = { ...inputs.stock };
  const cargo = { ...inputs.cargo };
  const stationSupplies: Record<string, number> = {};
  const cargoSupplies: Record<string, number> = {};
  const work: { id: string; from: number; to: number }[] = [];
  const shortfalls: string[] = [];
  let cost = 0;
  let requestedUnits = 0;
  let completedUnits = 0;
  for (const target of selected) {
    const requested = Math.max(0, target.maximum - target.current);
    requestedUnits += requested;
    if (!requested) continue;
    let low = 0;
    let high = Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(requested));
    // Supply and price requirements are monotonic, so binary search also handles large imported hulls safely.
    while (low < high) {
      const middle = low + Math.ceil((high - low) / 2);
      const allocation = allocateSupplies(target, Math.min(requested, middle), inputs, stock, cargo);
      if (allocation && allocation.cost <= inputs.credits - cost) low = middle;
      else high = middle - 1;
    }
    const units = Math.min(requested, low);
    const allocation = units > 0 ? allocateSupplies(target, units, inputs, stock, cargo) : null;
    if (allocation) {
      for (const [key, amount] of Object.entries(allocation.station)) {
        stock[key] = (stock[key] ?? 0) - amount;
        stationSupplies[key] = (stationSupplies[key] ?? 0) + amount;
      }
      for (const [key, amount] of Object.entries(allocation.cargo)) {
        cargo[key] = (cargo[key] ?? 0) - amount;
        cargoSupplies[key] = (cargoSupplies[key] ?? 0) + amount;
      }
      cost += allocation.cost;
      completedUnits += units;
      work.push({ id: target.id, from: target.current, to: target.current + units });
    }
    if (units < requested) {
      const missing = target.supplies.filter((key) => {
        const carried =
          key === 'DEUTERIUM_PELLETS'
            ? (cargo.DEUTERIUM ?? 0) + (cargo.DEUTERIUM_PELLETS ?? 0)
            : (cargo[key] ?? 0);
        return (
          (stock[key] ?? 0) + (inputs.useCargo ? carried : 0) <
          Math.ceil((requested - units) / target.unitsPerBatch)
        );
      });
      shortfalls.push(
        `${target.label}: ${missing.length ? `limited by ${missing.map((key) => getTradeItemInfo(key)?.name ?? key).join(' / ')}` : 'limited by available credits'}.`
      );
    }
  }
  if (!selected.length) shortfalls.push('This target is not supported by the robotic workshop.');
  if (selected.length && !requestedUnits)
    shortfalls.push('No service required; all selected targets are nominal.');
  return {
    stationId: inputs.stationId,
    revision: inputs.revision,
    kind: inputs.kind,
    targetId: inputs.targetId,
    label:
      inputs.targetId === 'all' ? 'Hull / rover restoration' : (selected[0]?.label ?? 'Unsupported service'),
    useCargo: inputs.useCargo,
    requestedUnits,
    completedUnits,
    unitLabel: inputs.kind === 'fuel' ? 'reactor units' : 'integrity points',
    cost,
    stationSupplies,
    cargoSupplies,
    work,
    shortfalls,
    inputSignature: JSON.stringify(inputs),
  };
}
