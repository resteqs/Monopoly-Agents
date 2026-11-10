Projektidee und Scope
Thema: RL-Agenten für Brettspiele mit simulierten Persönlichkeiten
Gruppe: 5 Personen, gegenseitige Supervision erwartet
Supervisor (Sebastian Griesbach) hat wenig Zeit, gibt aber Feedback und benotet

Technische Empfehlungen
Markovian-Spiele bevorzugen (z.B. Schach): kein Gedächtnis nötig für optimale Entscheidung
Multi-Agent-Setting ist komplex: Environment ändert sich ständig aus Agentenperspektive
Algorithmus-Empfehlung: PPO (On-Policy) statt DQN
PPO lernt Korrelation Observation → Action, robuster in nicht-stationären Umgebungen
DQN muss jeden State einzeln bewerten, schwieriger zu erfüllen
Nur einen Algorithmus wählen, nicht mehrere vergleichen
Kombination mit Persönlichkeiten würde Komplexität zu stark erhöhen

Persönlichkeiten modellieren
Ansatz 1: verschiedene Reward-Funktionen pro Agent (z.B. aggressiv vs. defensiv)
Ansatz 2 (NLP-Hintergrund der Gruppe): kleines LLM (~2B Parameter) per RL fine-tunen
Baseline: LLM modelliert Persönlichkeit anhand eines Personality-Tests
Keine Compute-Ressourcen vom Supervisor verfügbar, muss selbst organisiert werden
Feasibility noch zu prüfen

Prüfungsleistung
Abgabe: schriftlicher Report + Präsentation
Report: so kurz wie nötig, alles Relevante rein
Präsentation: Gruppenleistung, keine Pflicht zur gleichmäßigen Aufteilung
Note: Gruppenleistung, alle bekommen dieselbe Note (außer bei klarem Grund)
Anmeldung zur Prüfungsleistung erforderlich: Carlo Derramo muss als Prüfer eingetragen sein

Nächste Schritte
Konkreten Plan ausarbeiten: Spiel, Algorithmus, Scope der Persönlichkeiten
Alle 2 Wochen kurzen Zwischenstand per E-Mail an Sebastian
Nächstes Meeting: 11. November, 11:00 Uhr
Raphael Teller schickt den Termin an die anderen weiter

Nächste Schritte
Konkreten Projektplan ausarbeiten
Zur Prüfungsleistung anmelden
Termin 11.11. um 11:00 Uhr weiterleiten (Raphael)

---
# Meeting 10.11.2026 11Uhr Raphael, Jan, Daniil

# Game Choice: Monopoly

- Monopoly chosen unanimously: everyone knows it, and it’s ~98% Markovian
- “Snapshot test”: a photo of the board gives almost all state needed for the next best move
- Small non-Markovian gaps (all translatable to state):
  - Which Chance/Community Chest cards remain in the deck
  - Double-roll count (3 doubles = jail)
  - Opponent personality (behavior over time)

# Markovian State Design

- Monopoly is effectively Markovian: no need for frame stacking or history windows
- Curse of dimensionality makes full-history approaches impractical anyway
- Three partial-observability caveats to encode in state:
  - Remaining card deck composition (or simplify: omit entirely)
  - Double count per turn
  - Belief over opponent personality (initialize neutral, update over time)
- Game engine state vs. player-visible state are distinct: player doesn’t need to track all 40 squares or remaining cards

# Algorithm: PPO with Action Masking

- PPO chosen as primary algorithm
  - On-policy: no replay buffer; discards rollouts after each update
  - Monopoly simulator runs thousands of games per minute on a laptop, suits on-policy well
  - PPO is Actor-Critic: learns both a policy (action distribution) and a value function
- Action masking needed because output space is fixed-size (all possible actions), but not all are legal at every step
  - Illegal actions masked to probability 0, then Softmax renormalized
  - During inference, masking still applies (agent never explicitly learned illegality otherwise)
- Self-play recommended: train against a pool of past model versions + a few scripted bots
  - Prevents overfitting to current self; adds diversity without explicit personality modeling

# State and Action Space Design

- Turn vs. state distinction: one turn = a sequence of multiple state transitions
  - Roll → buy → build → (if doubles) roll again → build again → end turn
  - “End Turn” should be an explicit action
- Key state features to include:
  - Board ownership, property development levels, cash per player
  - Jail status + doubles count
  - Houses/hotels remaining (numeric ratio, not binary)
  - Opponent personality belief (later iteration)
- Card deck tracking: likely omittable for v1 (deck rarely empties; reshuffled anyway)

# Ruleset and Simplifications

- Use official out-of-the-box Monopoly rules as the base (World Championship standard)
- Confirmed house rules to exclude:
  - Free Parking jackpot
  - Double salary on landing exactly on Go
  - No rent collected in jail (actually incorrect: rent IS collected in jail per official rules)
- Trading: disable entirely for v1, or allow only templated offers (e.g., property for cash)
  - Trading is the hardest part of the action space; LLMs better suited for it later
- Bidding/auction: exclude for v1 (complex sequential action space, hard for MLP/RNN)
- Turn limit: add a cap (e.g., 200 turns) with a penalty reward for truncated games
  - Winner at cutoff = player with higher net worth (buy price of properties + cash)
- 2-player only to start; scale to 3-4 later if time allows

# Backbone Architecture

- Start with MLP: simple, fast, establishes a working baseline
  - Confirm convergence and reasonable behavior before switching
- GRU as next step if sequential history helps (GRUs preferred over LSTMs based on prior coursework)
- Transformer if player count becomes variable (handles variable-length input naturally)
- Plan: implement PPO from scratch first (learning value), then benchmark against Stable Baselines 3
  - Mirrors Karpathy-style pedagogy; good for the course and for the report

# Compute and Next Steps

- Available GPUs: Raphael’s 4070 Ti Super (16 GB VRAM), Antoni’s 2080 Super
  - Antoni’s machine can run training (separate room, always-on); split
