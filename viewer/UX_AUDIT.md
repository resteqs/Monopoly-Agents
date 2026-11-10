# Slopoly replay viewer: Laws of UX audit (pass 2)

Source of the law list: https://lawsofux.com (30 laws; the ones that apply to a read-only replay viewer are below).
Measured with the demo replay: board 767 px at 1440x900 (was ~690), 667 px at 1280x800 (was ~565), 359 px at 375x812.
Smallest board text now 9.2 px at 1440x900 (was ~7 px).

| Law | Observation | Change made (or kept, because) |
|---|---|---|
| Fitts | Transport buttons were 30 px, play 38 px | Buttons 34 px, play 44 px; seek bar and timeline unchanged (full width target) |
| Hick | Many controls compete; debug data and rules are noise for most viewers | Kept: debug/rules already folded into "Spielinfo"; side panel is now one toggle ("Verlauf") |
| Jakob | Players expect media-player controls and Space/arrows | Kept: standard transport icons, Space/arrows/Home/End unchanged; Esc closes the summary |
| Miller / Chunking | Seat = money + position + deeds grouped by colour set; log is one flat list | Kept seat chunking (deeds stacked per colour group); Pasch counter limited to 3 pips |
| Doherty Threshold | Controls respond at once; animation could delay feedback | Scrub/seek never animates; every dice throw starts on the key press; per-step feedback begins at t=0, long beats overlap instead of queueing |
| Peak-End | Game ended with a thin text banner | End moment: winner seat glows, summary dialog (net worth bars, rent, deeds, doubles, jail, turns) with "Nochmal ansehen" / "Schliessen" |
| Von Restorff | Current seat and the event tile were the only accents | Pasch gets its own accent (gold pips, red 3rd), jail/FREI/BANKROTT stamps, winner seat gold; everything else stays calm |
| Serial Position | Most important actions should sit at the ends | Kept: play is the centred, red, largest control; first/last at the ends; caption first in the bar |
| Aesthetic-Usability | Board look follows the Figma kit | Kept the kit look; pawns got one glossy shape and non-board colours; LOS corner matched to the reference |
| Law of Common Region | Seats, side sheet and transport are clear regions | Kept; summary is one bordered card; seat accent now has a cream hairline so dark/light colours clash less with the table |
| Proximity | Cash sat near its notes; flying notes were far from the cash counter | Notes fly seat to seat/bank, label rides along, counters tick when notes leave/arrive |
| Similarity | Money looked different in places | Kept one money style (struck M); one pawn shape, colour only differs; same player colours in seat, strip, chart, log, summary |
| Uniform Connectedness | Payer and receiver, deed and tile were unconnected | Banknote arcs connect payer and receiver; deed flies tile to deck; ownership strip grows in the player colour |
| Pragnanz | Complex scene with many tokens and pieces | Simple pawn silhouette, one effect per beat, stamps use one rotated box; numerals are plain Arabic digits |
| Tesler | Forced engine steps are noise but cannot be removed | Kept the "automatisch" tag and the skip-forced toggle; complexity moved into the choreography queue, not the user |
| Goal-Gradient | Progress was only a thin slider | Kept timeline fill and tick marks per turn; "Schritt n von N" always visible; summary appears as the goal |
| Zeigarnik | Unfinished game state is easy to forget | Kept the timeline, turn ticks and "Zug n"; a finished game shows a reopenable "Zusammenfassung" link |
| Postel | Loader must accept messy files | Kept lenient parsing (unknown events shown raw); output (board, labels) stays strict and German |
| Cognitive Load | Board text was tiny, so reading cost effort | Board 767 px, text min 9.2 px, seats narrower, side collapsible; dice sum is one big number |
| Selective Attention | Many things moved at once | Central queue shows one event at a time in causal order; the rest of the board stays still |
| Working Memory | Card text vanished quickly; dice result was lost | Card holds longer at slow speed (about 2.1 s at 0.5x); caption + log keep the sentence; transport keeps small dice |
| Flow | Long waits at 1x break flow | Speed select 0.5x-16x; at >= 8x everything collapses to instant state with a brief number/card fade |
| Choice Overload | Four speeds plus many shortcuts | Kept the speed list short; no new options added |

## Cash flight semantics (colour = who is involved)

- Player to player (rent, "pay each player"): notes in Monopoly denomination colours, edged in the payer's colour, arc seat to seat; `-M50` pops at the payer, `+M50` at the receiver; counters tick at departure / arrival (red down, green up).
- Player to bank (tax, card, price, building cost): plain kit-green notes into the BANK tray on the board; the tray pulses when it absorbs. Bank to player (Los salary, card income, building refund): same green notes leave the tray.
- Purchase: notes go to the bank, the deed flies the other way slightly later. Bankruptcy: remaining cash flies to the creditor (or bank) before the deeds return.
- At >= 8x or with reduced motion there are no flights: only the counter change with a brief green/red flash.

## Top 3 remaining issues

1. Pace at 1x: a step with a dice throw plus 9 hops takes about 4.5 s, so 330 steps are long; a "Zug-Modus" (animate only the current move, skip idle steps) would help.
2. Two pawns sharing a tile and a 3-4 player game were checked by geometry and with two players only; no 3-4 player replay exists to test the crowded layouts.
3. On phones the side sheet (log, chart) sits far below the seats; a bottom sheet or tabs would shorten the scroll, and the seat rack scrolls internally on narrow seats.
