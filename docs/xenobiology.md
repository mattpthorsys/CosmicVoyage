# Xenobiology: Playing And Extending Version One

Cosmic Voyage now has a bounded discovery, observation, sampling and research
loop. It is an addition to ordinary surface travel, not a separate world mode.

The first expansion adds habitat-dependent communities, local grazing-group
retreat, and one finite live-reference request per inhabited station when a
real compatible population is available. Automated depots do not issue these
requests. The expansion's automated and browser verification is pending the
requested testing/model-switching phase; do not treat these notes as playtest
evidence.

## First Expedition

1. Visit the colony in the guaranteed starting hub, one cell east of the new
   voyage's starting position. Complete terraformed colonies provide a managed,
   already-catalogued biosphere for learning the instruments. Native life is
   occasional, not guaranteed, on suitable liquid-water worlds.
2. Enter orbit around the colony. The scan summary indicates biological
   signatures. `D` opens the planetary dossier, including habitat coordinates
   once terrain preparation finishes.
3. Press `B` to select an accessible habitat on the landing map. Repeated `B`
   cycles habitats. If coordinates are still preparing, wait and press it again.
   `Enter` lands at the selected coordinate.
4. In landed ship operations, select Terrain Vehicle, then Disembark. Press `B`
   or choose **Life** to investigate the habitat. Entry requires a deployed,
   serviceable rover within one regional cell of the habitat.
5. Observe and analyse contacts before deciding which specimens justify capture.
   Unknown native species generally offer much more scientific value than
   familiar managed organisms.

## Habitat Communities

Prepared land sites are classified from numeric relief and nearby verified
liquid-water coverage, not their display colour. Water margins support producer
patches, grazers and detritus consumers; sheltered ground has substrate colonies
and shelter-associated consumers; exposed ground has sparser producers and
foragers. These are coarse habitat priors, not a rainfall or ecosystem model.
Metre-scale moist/open/sheltered patches are a local procedural interpretation
of the region. They retain its terrain palette and affect placement; outcrops
still use the existing passability rules.

New profiled fields contain approximately five to eight organisms from three
relevant taxa rather than the same ten-contact distribution at every site.
Small aerobic grazers on water margins form loose groups. A nearby member
sensing the rover can trigger local coordinated withdrawal; after a short
disturbance interval, separated members can regroup. This is a bounded local
response, not global communication, hunger or reproduction. Most life remains
nonaggressive. Behaviour still advances only through successful actions.

Previously visited fields retain their saved composition and state. Their older
layout is not regenerated, and captured organisms do not return on reentry.

## Field Controls

| Key           | Action                                                  |
| ------------- | ------------------------------------------------------- |
| Arrows        | One local rover step; cells represent approximately 5 m |
| Tab           | Cycle visible contacts                                  |
| V             | Observe the selected organism                           |
| A             | Detailed biochemical analysis within 25 m               |
| Enter / Space | Select an action in the bottom command bar              |
| T             | Prepare the variable-power stunner                      |
| S             | Take a tissue sample                                    |
| C             | Collect the selected nearby organism                    |
| K             | Prepare a confirmed lethal shot                         |
| W             | Wait ten local seconds                                  |
| D             | Scrollable dossier for the selected species             |
| N             | Personal species/evidence record                        |
| O             | Rover cargo manifest                                    |
| Escape        | Close a panel, or withdraw near the entry at X16 Y21    |

The bottom menu includes Observe, Analyse, Stun, Sample, Collect, Shoot,
Wait, Dossier, Species, Cargo, Missions and Withdraw. Left/Right (or Up/Down) select;
Enter executes. Buttons also work directly with the mouse or their hotkeys.
Escape leaves menu selection and restores driving.

The close field view retains the habitat's regional terrain colour. Tiny
four-colour silhouettes distinguish the rover, mobile organisms and sessile
colonies. A telemetry panel shows rover integrity, fuel, actual crew health,
cargo percentage/volume and a short evidence-limited contact description.
On narrow displays the telemetry sits below the terrain instead of beside it.

In stun preparation, Left/Right choose low, standard or high dose. The display
updates incapacitation and mortality estimates before Enter fires. Escape
cancels. Shooting is lethal and requires an additional confirmation.

In dossiers, Up/Down and Page Up/Page Down scroll. The terminal writes quickly;
any fresh key completes an unfinished reveal without also executing another
action. Escape then returns to the field.

## Evidence And Collection

Contacts begin unresolved. Observations beyond 40 m provide only preliminary
evidence; observations within 40 m establish a catalogue match. Close analysis
or physical sampling reveals the fuller biological description.

Scanner classifications distinguish unresolved catalogue matches, unknown
species, known species not personally collected, personal collections and
species that science has adequately sampled. The scanner quotes observational
data, tissue, dead specimens and live specimens once identification is reliable
enough. Actual quality and prior submissions affect those estimates.

Physical sampling requires approach within 7.5 m. A tissue sample uses a small
sealed container and needs no stasis. A mobile organism must be incapacitated
for whole live collection, except for benign organisms no larger than 0.5 m
and 5 kg. Sessile organisms can be collected directly. Dead
organisms can provide intact remains. Each individual supplies at most one
tissue sample and one whole specimen: revisiting or reloading does not recreate
it.

To pick up an organism, drive next to it (small benign organisms can share the
rover's cell), press `O` for Cargo, select **Collect selected organism** or
**Collect nearby organism**, and press Enter. The sealed specimen then appears
in that same manifest. `C` is a shortcut for the selected contact. Large mobile
organisms must first be stunned; incompatible stasis, a full hold or exhausted
live slots refuse collection without advancing time or removing the organism.

Containers use ordinary cargo volume, cannot be split into commodity quantities,
and appear in ship/rover manifests. Disposal requires confirmation and is
irreversible. Docking transfers whole containers that fit; overflow remains in
the stowed rover. Ordinary commodity sales do not sell biological containers.

## Stasis, Threats And Time

Basic stasis is fitted from the beginning and supports ordinary Earth-like
life. Extended equipment is available at an inhabited starbase's Shipyard:

| Kit      | Cost     | Envelope               | Live slots per carrier |
| -------- | -------- | ---------------------- | ---------------------- |
| Basic    | Included | 280-315 K; 0.3-2 bar   | 2                      |
| Extended | 1,900 Cr | 273-345 K; 0.04-12 bar | 6                      |

Basic stasis shares the standard survey bay. Upgrading uses that same bay.
Both kits support the version-one carbon-water profiles and a handling limit
of 80 kg. Containers also need cargo volume. Incompatible live specimens remain
in the field; observations, tissue and dead specimens are still alternatives.

Most organisms are sessile, passive or skittish. Territorial organisms and
ambushers can threaten rover armour, but an initial warning action does not also
inflict damage. The crew remains inside the vehicle. Incapacitation is temporary;
recovery time runs on the local action clock. Repeated stun exposure increases
injury and mortality. Estimates narrow with better evidence.

While a field is active, accelerated planetary/orbital time is suspended. Only
successful operations advance local time and NPC behaviour: a step costs five
seconds, observation five, analysis ten, collection five, a weapon discharge two
and Wait ten. Menus, reading, target selection, idling and refused actions cost
no time. Actors remain frozen while the expedition is away.

Return to entry to withdraw. Exhausted local fuel permits emergency withdrawal
without walking back. Zero integrity forces retreat, retaining cargo but leaving
the rover at 15% integrity; repair to at least 30% before another expedition.
Repair is offered beside the parked ship or in starbase Services at 5 Cr per
integrity point. Abandoning a fuel-exhausted rover during regional travel loses
its biological containers; recorded evidence remains.

## Research Exchange

Visit **Research** at an inhabited starbase. Automated depots cannot receive
scientific contributions. Up/Down select a data record or sealed container;
Enter submits it at the displayed award.

Submitting data retains your evidence. Submitting a specimen consumes the whole
container. The exchange can receive specimens in the ship and stowed rover.
Demand is campaign-wide, not station stock: station hopping does not renew it.
Identical scans and repeated submissions earn nothing; a stronger contribution
can earn only the remaining novelty entitlement. Repeat specimens rapidly lose
value. Origin remoteness contributes a bounded premium, not a bonus for hauling
ordinary organisms arbitrary distances.

Physical specimens also appear in **Sell**, including those worth `0 Cr` and
containers remaining in the stowed rover. The displayed price is for one whole
container, not per cubic metre. Enter submits a valuable specimen through the
same campaign-wide research ledger; switching tabs or ports cannot collect the
award twice. Zero-demand specimens remain visible and aboard, with an explanation
when selected. Automated depots show the containers but cannot receive them;
take them to an inhabited port. Scientific data remains in **Research**.

## Live Reference Contracts

Press `J` for the **Mission Journal** from travel, orbit or a field expedition.
It is also available in **Ship Operations**, the regional rover and local field
action menus, and **Missions > Ship mission journal** at a station. Escape
returns to the menu you opened it from. Time is held while you read.

Left/Right (or Tab) cycle accepted contracts; Up/Down and Page Up/Page Down
scroll. The colour-coded terminal shows hyperspace X/Y, the resolved contact
number, destination body, habitat X/Y, live/quality requirements, reward and
delivery station. Any key finishes its initial text reveal before acting.

While orbiting the destination planet or its parent, open `J`, select the
contract and press Enter to put the landing cursor on the requested habitat.
The correct moon is selected when necessary. The journal closes; **Enter again**
confirms landing. No travel or landing occurs automatically. Survey contracts
that allow any surface site say so rather than inventing coordinates. Older
contracts without recorded navigation data resolve it when their system is
revisited; habitat coordinates may need local terrain preparation.

At an inhabited port, open **Missions** and look for **Habitat reference
specimen**. Surface data may briefly prepare in the background before an offer
appears. The board only requests an actually obtainable, scientifically
recognised organism compatible with included basic stasis. Some ports have no
suitable local offer; no planet or species is manufactured to fill the board.

Accept with Enter. The request gives the planet, habitat X/Y, species, live
condition and minimum quality of 75%. After reliable observation, matching
contacts show the accepted request in the field assessment and `D` dossier.
Approach, stun if necessary, and use `O` Cargo or `C` to collect normally.
Tissue and dead specimens retain their ordinary scientific use but do not
satisfy a live-reference request. Repeated stunning can reduce specimen quality.

Return the sealed container to the issuer, in either the ship or stowed rover.
In **Research**, select the live-delivery contract row and press Enter; **Missions**
also settles it with Enter when READY. Delivery consumes exactly one eligible
whole container and pays a **900 Cr contract fee plus remaining ordinary
research value**, which can legitimately be zero. The scientific contribution
is recorded in the same campaign ledger used by Research and Sell. The contract
is finite, not refreshed by changing tabs or revisiting the station.

Readiness reflects actual current cargo. Selling, discarding or losing the
container removes READY; a previous personal collection does not count as
delivery. Sell details identify specimens matching an accepted request, but
ordinary sales do not fulfil it or pay the contract fee. An accepted target
stays fixed even if a newly generated board offer would choose another species.

## Implementation Map

- `entities/biology/biosphere_generator.ts`: numeric environment adapter,
  independently seeded species/lineages and accessible regional habitats.
- `entities/biology/habitat.ts`: numeric site classification, constrained
  communities and independently seeded local ecological patches.
- `entities/biology/biology_types.ts`: versioned identities and persisted records.
- `entities/biology/stun_model.ts`: shared fictional dose-response model and
  uncertainty projection; these probabilities are gameplay priors, not measured
  alien physiology.
- `systems/surface_encounter_system.ts`: connected 32x24 local terrain, ten
  persistent individuals, visibility, successful-command time and bounded
  rot-js routing. NPCs cannot occupy the reserved return point.
- `systems/specimen_cargo_system.ts`: whole-container validation and transfer.
- `core/xenobiology_service.ts`: evidence, scientific recognition and marginal
  campaign research awards, including zero-value scientific acceptance only
  when explicitly delivered under a contract.
- `core/biological_contracts.ts`: real compatible reference offers and atomic
  whole-container delivery across mission, research, cargo and credit owners.
- `core/mission_board.ts` and `core/mission_progress.ts`: typed scan/specimen
  objectives, fixed accepted targets, and cargo-derived delivery readiness.
- `core/mission_navigation.ts` and `core/mission_journal.ts`: persisted typed
  destinations, safe orbital-family matching and a paused, scrollable terminal
  with contextual landing-site selection.
- `core/modes/surface_encounter_controller.ts`: mutually exclusive driving,
  operations, weapon preparation, confirmation and dossiers. Its modals use the
  existing `InterfaceModeController`'s `xenobiology` owner.
- `core/xenobiology_ui.ts`: evidence-limited scanner, dossiers, manifests and
  research rows. Renderers never receive hidden traits as scanner text.
- `rendering/surface_encounter_renderer.ts`: detached field snapshot drawing;
  narrow screens crop the camera without changing physical field coordinates.
- `core/encounter_surface.ts` and `rendering/encounter_sprites.ts`: cached native
  terrain appearance and independently seeded four-colour pixel silhouettes.
- `core/encounter_actions.ts`: one action list shared by hotkeys and the bottom
  command bar, rather than a second boxed operations menu.
- `core/save_game.ts` and `entities/biology/biology_validation.ts`: schema 12,
  migration from 11 preserving existing specimens/fields, and validation of
  habitat/group metadata, mission objectives, species, actor lifecycle, demand,
  containers, ownership and active-location consistency. Earlier saves still
  migrate through the existing chain; unrelated world identities do not change.

Regional longitude wraps and latitude stops at the poles. Movement, display,
mining, scanning, habitat proximity and ship bearings now follow that convention.
The intentional polar drawing snapshot changed; unrelated space/orbit/station
snapshots did not.

## Verification And Bounds

Run `npm run check`. Focused tests cover deterministic biology, evidence masking,
outcomes, refusal atomicity, command time, source depletion, cargo transfer,
duplicate ownership, versioned saves, station payments and rendering bounds.
The test pool is limited to four workers to prevent CPU-heavy surface fixtures
from timing out under excessive concurrency.

For a real-font browser playthrough, install Playwright separately or point
`PLAYWRIGHT_MODULE` at an existing installation, then run
`node scripts/check_xenobiology_browser.cjs` with the dev server running.
`COSMIC_URL`, `CHROME_PATH` and `XENO_CAPTURE_DIR` are optional. The script imports
a reproducible save using a real generated starting colony, drives the ordinary
controls, reloads a specimen, verifies scientific payment and writes desktop/
narrow screenshots plus canvas/font checks. No development shortcuts are added
to normal gameplay.

Version one deliberately omits ecosystem simulation, exotic solvents,
reproductive-material commodities, unusual individual variants, articulated
body construction, personal ground combat and a full phylogeny
browser. Three small inherited clades and five behavioural archetypes establish
the first loop. Long-session economy balance and player enjoyment still need
playtesting; automated verification cannot establish those.
