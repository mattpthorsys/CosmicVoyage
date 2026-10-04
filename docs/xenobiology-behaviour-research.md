# Xenobiology: Habitat Activity And Field Research

Status: implementation committed in three stages; automated checks and browser
verification are pending the requested Luna handoff. No measured performance
or successful playtest is claimed by this document.

## What Changed

1. Suitable grazers seek reachable producer patches. Detritivores seek moist or
   sheltered substrate near a producer community. Shelter-seeking organisms
   move to actual sheltered substrate during their resting phase. These are
   deterministic, bounded activity choices, not a simulated food web. Producers
   are not consumed and there is no new hunger/reproduction clock.
   Resource trips finish before the next activity phase is selected, so an
   animal does not oscillate forever between distant food and shelter.
2. Passive field actions can record feeding, shelter use, coordinated retreat
   and defensive displays. Identification must already be resolved. Sources
   must be visible within 40 m, active, uninjured, unstunned and unsampled when
   witnessed, with no prior weapon exposure. A recovered stunned organism is
   therefore not an undisturbed field-study source. Retreat requires at least two visible group members actually
   moving together, not simply an alert timer. Shooting, stunning, sampling and
   collecting cannot create these records.
3. Staffed stations can offer finite feeding and shelter-use surveys and a
   coordinated-retreat survey/comparison. Requests use real obtainable contacts
   or previously witnessed episodes. A two-site comparison is offered only
   where the species has suitable groups in contrasting habitats; otherwise
   the request can be a single-site retreat survey. No dangerous-display
   contract is offered.

Observation records appear under **FIELD ETHOLOGY** in the coloured dossier and
are retained in the science log. They document an episode, not proof of a
habitual behaviour, an adaptation or an evolutionary cause. A site/type record
is saved once; repeated waiting earns nothing extra. Ordinary scan quality,
catalogue novelty, specimen demand and prices remain independent.

## Personal Playtest

Use a new voyage or an unvisited habitat for the new foraging traits. Existing
visited fields retain their saved species definitions and previous movement
where these optional traits are absent. There is no automatic reset of old
species, specimens or knowledge.

### A Feeding Survey

1. At a staffed port, open **Missions** and look for **Feeding behaviour survey**.
   Not every station/planet necessarily has all three offers. Accept the job.
2. Press **J**, select the survey and follow its actual system, body and landing
   coordinates. **Enter** from orbit selects its landing site; the existing
   mission destination controls still apply. Deploy the rover and enter the
   local biological field with **B** when available.
3. Select the requested grazer with **Tab** and use **V Observe** within 40 m to
   confirm its identity. Matching eligible contacts receive the existing green
   mission marker. Stay about 35-40 m away from skittish grazers so they can feed
   instead of retreating. Keep the producer patch visible, not behind a rock.
4. Use **W Watch** to advance ten local seconds. Let the contact reach its
   resource; the activity readout distinguishes foraging from feeding. A
   confirmed episode produces a short `Field record` message. Do not stun,
   shoot or sample the intended observation source.
5. Open **D Dossier**, scroll to **FIELD ETHOLOGY** and check the witnessed
   feeding record. **J** should show the job as ready, and that objective should
   no longer mark the contact. Reports, Cargo and Operations must freeze local
   actors/time rather than silently advance the observation.
6. Return to the issuing station and hand in through **Research** or **Missions**.
   Feeding pays exactly **650 Cr**. The job uses no cargo, stasis, specimen or
   ordinary research entitlement. It cannot be accepted/paid again. Ordinary
   scan submission remains a separate choice, not a second survey payment.

### Shelter And Group Studies

- **Shelter-use survey:** find the identified shelter-seeking contact in its
  requested habitat. Watch it use sheltered substrate during a resting phase.
  Waiting beside an animal on open ground does not count. Fee: **600 Cr**.
- **Coordinated retreat:** identify the requested group, then approach gently
  to around 25-30 m. At least two clean, visible members must move away together.
  Back off afterwards; no capture or attack is required. A single-site survey
  pays **650 Cr**. A genuine two-habitat comparison pays **1,100 Cr**, once.
- For a comparison, **J** retains the first site's progress and the existing
  **B** destination control selects the other outstanding habitat. Turn-in
  must refuse partial completion without consuming anything or paying credits.
- Defensive displays can be retained as ordinary field evidence. Withdraw when
  warned; they are not a new mandatory or repeat-paying dangerous objective.

### Persistence And Presentation

- Save/checkpoint after an episode, reload, and check **D** and **X Science log**.
  Records and partial objectives should persist without duplicate entries.
- A valid episode recorded before accepting the matching job should count on
  acceptance. Capturing the source later does not erase what was witnessed.
- Check both a normal and narrow window. Headings remain thick, values thin,
  the report is scrollable, and creature sprites must not appear over a popup.
- **O Operations** and **I Cargo** retain their normal separate functions.
  Default basic stasis and physical specimen jobs are unchanged.

## Implementation Boundaries

- `organism_foraging.ts` owns bounded habitat-directed intents; `rot-js` routes
  around actual collision/occupancy rules. `organism_behaviour.ts` identifies
  eligible sources for field guidance and survey generation.
- `surface_encounter_system.ts` emits witnesses after actual simulation ticks;
  the existing explicit action clock remains authoritative. Passive actions
  can record all visible qualifying contacts, not only the selected one.
- `XenobiologyService` owns durable evidence, keyed by species/site/type, capped
  at 128 episodes per species without evicting records behind accepted jobs.
  Current generation has at most six canonical sites per body. Activity does
  not create a new novelty/sample award.
- `behaviour_research.ts` preflights feeding/shelter opportunities against real
  reachable resources. It generates fields once per board call and routes only
  the required activity phase. No persistent cache or ecosystem manager exists.
- Mission progress requires the correct kind/species/site. Atomic turn-in also
  checks the actual retained evidence, issuing station and completed packets.
  A READY flag alone cannot invent a reward.
- Save schema **16** accepts/migrates version-15 records without fabricating
  observations. Optional biological traits do not reroll old identities or
  unrelated random streams. Saved episodes reference real field/source IDs.

## Luna Verification Handoff

Run focused tests for `organism_foraging`, `behaviour_observations`,
`behaviour_research`, biological contracts/guidance, Game integration, save
boundaries and rendering, followed by `npm run check`. The added tests cover
unavailable resources, harmed sources, line of sight, true group motion,
determinism, prior evidence, two-site partial progress, provenance, fixed fees,
repeat refusal, persistence and responsive dossier rendering.

Then run the extended real-font browser walkthrough against the local server:

```sh
COSMIC_URL=http://127.0.0.1:5175/ PLAYWRIGHT_MODULE=/home/mpalmer/.cache/ms-playwright-go/1.57.0/package node scripts/check_xenobiology_browser.cjs
```

Inspect its desktop/narrow captures in `/tmp/cosmic-xenobiology`, especially the
new ethology dossier, source markers and research hand-in. The walkthrough
also contains the previously pending lethal-confirmation, stunned-contact,
field Operations and shipyard-repair checks. Announce results separately;
this document is an implementation handoff, not a test report.

## Step Four

The three stages above passed full automated and browser verification in
`8822852` (840 tests). The user also completed a successful personal expedition.

Step four now implements finite viable buds from one sessile mat family,
with distinct demand, provenance and preservation. It is pending Luna
verification. See [the propagule guide and checkpoints](xenobiology-propagules.md).
Breeding, population growth and a general reproductive simulation remain deferred.
