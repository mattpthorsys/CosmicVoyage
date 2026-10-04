# Xenobiology: Viable Mat Propagules

Step four is implemented. Automated and browser verification are pending the
requested Luna handoff; this is not a test report.

## Scope

The prototype supports one sessile, water-based mat family. Managed mats on
terraformed colonies provide an accessible first expedition. Native mat
families can share the same reproductive character through their existing
inherited body plan. Other organisms have no implied reproductive commodity.

The material consists of detachable dormant buds: a small viable dispersal
batch, not an egg, seed, intact adult or arbitrary piece of tissue. There is no
breeding, population growth, regrowth timer or ecosystem reproductive simulation.
This is a bounded game-content hypothesis, not a claim about the frequency or
physiology of extraterrestrial reproduction.

## Personal Expedition

1. At an inhabited starting-hub port, find **Viable mat propagules** through
   Missions or Research. Accept it; the existing journal (`J`) supplies the
   planet, habitat coordinates and landing selection. A request appears only
   when a real eligible source or a valid owned batch exists.
2. Land at the indicated moist-margin habitat and enter its biological field.
   Select the mat with `Tab` if necessary. `V` identifies it; `A` analyses it
   from within 25 metres. `D` opens its dossier.
3. The coloured **REPRODUCTIVE MATERIAL** section describes the buds, scientific
   demand and containment requirements. Preliminary observations do not reveal
   verified viability or reproductive prices. Full analysis unlocks them.
4. Move adjacent to the mat, within 7.5 metres. Press `I` for Cargo. Select
   **Harvest viable propagules**, then `Enter`. The parent remains visible and
   intact; one sealed batch enters rover cargo. No stun is required.
5. Open Cargo again. The harvest entry now explains that the source is depleted.
   You may still collect the adult separately or take tissue, but sampling
   tissue _before_ harvesting makes that source ineligible for a viable batch.
6. Return to the issuing port and deliver through Research or Missions. The
   request pays **750 Cr plus remaining reproductive research value**, consumes
   exactly its assigned batch, and completes once. Selling through Sell awards
   ordinary scientific value but does not fulfil a contract.

Check that the identified eligible mat receives the existing mission marker,
and that the scanner/dossier explain analysis, harm, preservation and depletion
refusals. A completed or cargo-ready request should not invite another harvest.

## Preservation And Cargo

- A batch contains 5 g of biological material in a 0.1 m^3 sealed container.
  Displayed batch mass is not the parent organism's mass.
- Each viable batch occupies one live preservation slot, shared with intact
  living specimens on that carrier. Basic equipment has two slots per carrier.
- Native temperature, pressure and solvent compatibility still apply. Detachable
  buds do not require the parent's substrate cradle or whole-parent handling mass.
  Dormancy does not grant universal resistance to heat, vacuum or alien chemistry.
- Full cargo, occupied slots or incompatible equipment refuse collection or
  transfer atomically. The source and clocks remain unchanged on refusal.
- The source must be active, uninjured, unsampled and free of weapon exposure.
  A dead parent does not supply verified viable material in this first version.
- Stasis reliably preserves an acquired batch. Later harm or removal of its
  parent does not invalidate that container. There is no preservation micromanagement.
- Cargo, Research and Sell list reproductive containers, including zero-demand
  material. Disposal never replenishes a harvested source.

## Scientific Demand

Reproductive references have their own baseline and campaign sample count.
An adequately sampled adult can therefore still have useful dispersal material.
Managed mats begin with two reproductive references already catalogued; these
ordinary batches have modest value, while finite contracts provide a reason
to make the expedition.

Every accepted reproductive batch multiplies the subsequent additional-reference
award by 0.25, as in ordinary sample demand. Data, tissue, dead, live and reproductive
material share the existing cumulative species-discovery entitlement. Reproduction
does not create another discovery jackpot. No distance multiplier or renewed
novelty is added.

Source ID plus contribution kind prevents reselling a renamed batch. Each
station's contract uses one stable finite request ID, the existing issuer checks,
physical-container allocation and atomic settlement. Adults and tissue cannot
substitute for propagules.

## Implementation Boundaries

- `entities/biology/propagules.ts`: narrow eligibility, finite availability and
  batch-specific handling profile.
- `biology_types.ts`: explicit reproductive capability, source depletion,
  container kind and separate demand counter.
- `surface_encounter_system.ts`: physical harvest and local action time.
- `specimen_cargo_system.ts`: shared preservation slots and atomic transfers.
- `specimen_provenance.ts`: one provenance rule shared by save validation and
  contract delivery, including canonical reproductive requirements.
- `core/propagule_research.ts`: a finite obtainable reproductive reference request.
- `xenobiology_service.ts`: independent declining reproductive demand with shared
  novelty; `game.ts` and terminal presentation own acquisition controls and reports.

Save schema 17 stores batches and source depletion. Version-16 and earlier saves
are validated before compatible mat profiles gain the new capability. Identity,
positions, tissue history, cargo ownership and previous payments are retained.
Migration does not grant a harvested batch, clear harm, replenish sampled parents
or invent reproductive submissions. No new biology RNG draws are introduced.

## Luna Verification

Run the normal complete check once:

```sh
npm run check
```

The new focused suites cover inherited eligibility, atomic refusals, finite
depletion, shared slots, detached-parent handling, source provenance, diminishing
reproductive demand, common novelty, material-specific contracts, issuer checks,
save/storage migration and readable progressive terminal presentation. Game
integration tests exercise Cargo's real harvest dispatch rather than invented
containers.

Then run the extended real-font browser walkthrough:

```sh
COSMIC_URL=http://127.0.0.1:5176/ PLAYWRIGHT_MODULE=/home/mpalmer/.cache/ms-playwright-go/1.57.0/package node scripts/check_xenobiology_browser.cjs
```

Inspect `/tmp/cosmic-xenobiology` captures for the desktop/narrow reproductive
dossier, narrow Cargo harvest, Sell listing and research hand-in. The walkthrough
uses a real generated mat, keyboard analysis and Cargo collection, JSON
import/export, parent persistence, depletion and exact contract payment. It also
retains the existing ethology, comparisons, preservation, combat and repair
regressions. Announce results separately before returning to implementation.
