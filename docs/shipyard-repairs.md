# Shipyard Repair Control

Open the **Shipyard** tab at a staffed port and select the highlighted first
entry, **Repairs / diagnostics**. Opening the terminal does not charge credits.
The diagnostic readout writes quickly; the first key completes that animation.

The terminal lists damaged hull and ship systems, plus a damaged rover if one
is aboard. Healthy systems are omitted from the work orders. Condition bars,
individual prices, the complete restoration quote and account balance are
shown in the game's terminal colours.

- **Up/Down** selects a work order; **Page Up/Down** advances through the list.
- **Enter** repairs the selected system, or all damage when Complete Restoration
  is selected. **A** also repairs all damage.
- **Escape** closes the terminal and returns to the same Shipyard tab.
- The bottom menu provides the same commands by mouse.

Each purchase checks the current damage and available credits again. Hull work
costs 12 Cr per damage point, ship systems cost 18 Cr per percentage point of
damage, and rover repairs cost 5 Cr per integrity point. Individual repairs
leave other damaged systems untouched. No payment is taken for unaffordable
work or equipment that no longer needs repair.

## Related Controls

**O** opens Operations during interstellar, interplanetary, regional surface and
biological-field travel. Field operations preserve the current habitat,
selected creature and local time. **I** opens rover cargo in surface travel and
the biological field; the diagnostic test shortcut is now **F4**.

The lethal-shot confirmation remains open until **Enter** confirms or **Escape**
cancels. Stunned organisms have an amber **zZ** badge, retain a stationary pose,
and show their selected activity readout in amber. The badge disappears when
they recover or are collected.

## Verification Handoff

Implementation and regression coverage are committed; execution is pending
the requested Luna switch. Run `npm run check`, then the expanded
`scripts/check_xenobiology_browser.cjs` walkthrough. That walkthrough captures
stunned contacts, the persistent lethal confirmation, field Operations and
desktop/narrow repair terminals, and verifies selective and complete payment.
