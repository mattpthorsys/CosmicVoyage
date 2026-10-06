import { prepareHaulCommissioning } from '../../core/heavy_haul_commissioning';
import { prepareHaulJourney } from '../../core/heavy_haul_journey';
import { InfrastructureRegistry, reserveInstallationOrbit } from '../../core/infrastructure_registry';
import { getHeavyHaulObjective } from '../../core/mission_board';
import { materializeHaulSites } from '../../core/haul_sites';
import { haulJourneyFixture } from './heavy_haul_journeys';

/** Completes a real external transfer and deployment, leaving its ship free to make a deferred return. */
export function homeboundJourneyFixture() {
  const fixture = haulJourneyFixture();
  const objective = getHeavyHaulObjective(fixture.save.activeMissions[fixture.mission.id])!;
  const destination = fixture.world.createSystem(objective.destination.systemAddress);
  if (!destination) throw new Error('No fixture destination system.');
  const orbit = reserveInstallationOrbit(destination, objective.destination.orbit.radiusM, 0.7);
  if (!orbit) throw new Error('No fixture deployment orbit.');
  fixture.save.activeMissions[fixture.mission.id].objectives = [
    { ...objective, destination: { ...objective.destination, orbit } },
  ];
  const departed = prepareHaulJourney(fixture.save, fixture.source, fixture.request, fixture.world);
  if (!departed.ok) throw new Error(departed.message);
  const arrival = departed.journey;
  const contact = arrival.system.navigationMarkers.find(
    (entry) => entry.id === objective.destination.siteId
  )!;
  arrival.save.player.position.systemX = contact.systemX;
  arrival.save.player.position.systemY = contact.systemY;
  const deployed = prepareHaulCommissioning(arrival.save, arrival.system);
  if (!deployed.ok) throw new Error(deployed.message);
  const registry = new InfrastructureRegistry();
  registry.restore(deployed.save.infrastructure);
  registry.materialize(arrival.system, deployed.save.bulkAdvanceSeconds);
  materializeHaulSites(arrival.system, undefined, undefined, deployed.save.bulkAdvanceSeconds);
  return {
    save: deployed.save,
    source: arrival.system,
    world: fixture.world,
    assetId: `haul-installation:${fixture.mission.id}`,
  };
}
