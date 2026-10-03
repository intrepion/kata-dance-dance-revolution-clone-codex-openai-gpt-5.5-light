# Dance Step Rhythm Game

This context defines the gameplay language for a legally distinct browser rhythm-step game inspired by arcade dance games.

## Language

**Stage**:
A single playable song attempt from start through clear, fail, or results.
_Avoid_: Level, round, match

**Countdown**:
The short pre-stage timing sequence that begins after the player gesture and ends when the track and chart start together.
_Avoid_: Intro, ready screen, delay

**Track**:
The original audio piece used by a stage.
_Avoid_: Song, music file, beat

**Chart**:
The timed sequence of steps authored for a track.
_Avoid_: Map, pattern, script

**Step**:
A single directional input target within a chart.
_Avoid_: Note, arrow, beat

**Lane**:
One of the four directional columns that carries steps toward its receptor.
_Avoid_: Column, track, rail

**Receptor**:
The fixed target position where incoming steps are judged.
_Avoid_: Target, hit zone, goal

**Upward Scroll**:
The presentation model where steps travel from the bottom of the playfield toward receptors near the top.
_Avoid_: Reverse scroll, note highway, falling arrows

**Judgment**:
The timing-quality result assigned when a player hits or misses a step.
_Avoid_: Score event, rating, feedback

**Combo**:
The current streak of non-missed judgments within a stage.
_Avoid_: Streak, chain, multiplier

**Life Bar**:
The stage survival meter that rises on accurate judgments and falls on misses.
_Avoid_: Health, energy, stamina

**Stage Fail**:
The early end state reached when the life bar empties before the chart finishes.
_Avoid_: Game over, death, loss

**Grade**:
The summary rank awarded on the results screen after a stage ends.
_Avoid_: Rank, rating, score class
