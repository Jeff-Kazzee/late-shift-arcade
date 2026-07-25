---
project: late-shift-arcade
status: active
game: reusable GDD template
related_modules: [game-development]
related_changes: [process-reset]
verification: [process-reset-verification]
---
# Game design document template

Keep the current playable bet near the top. Future vision may be ambitious, but
it cannot silently become current scope.

## 1. Identity

- **Working title:**
- **One-sentence promise:**
- **Player fantasy:**
- **Audience and platform:**
- **Expected session length:**
- **Why this belongs in Late Shift Arcade:**

## 2. Experience pillars

Name at most three. Each pillar must describe something the player does or feels,
not a technology.

1.
2.
3.

Also name the anti-pillars: what the game deliberately does not become.

## 3. Player verbs and controls

List every verb available in the current bet and its keyboard, pointer, touch,
and controller mapping where applicable. Cut a mechanic whose control cannot be explained plainly.

## 4. Core loop

- **Ten-second loop:**
- **One-minute loop:**
- **Run/session loop:**
- **Win condition:**
- **Loss condition:**
- **Score or progress feedback:**
- **Why the player immediately wants another run:**

## 5. Rules and state

Describe only the rules needed to implement and balance the current bet:

- player state;
- world/board state;
- resources;
- enemies or hazards;
- progression during a run;
- scoring;
- difficulty escalation;
- pause, restart, resume, and failure behavior.

Put technical architecture in a linked technical design, not here.

## 6. Content budget

State hard ceilings for the current bet:

- environments/boards:
- enemies/hazards:
- items/power-ups:
- levels/waves/days:
- tutorial steps:
- sound cues/music:

## 7. Presentation

- **Visual direction and references:**
- **Readability rules:**
- **Animation and feedback:**
- **Audio direction:**
- **HUD/information hierarchy:**
- **First 30 seconds:**
- **End-of-run presentation:**

## 8. Onboarding and accessibility

Explain how a first-time player learns without Jeff or a developer speaking.
Include reduced motion, contrast, text/readability, remapping alternatives,
audio-independent cues, touch targets, and pause behavior as relevant.

## 9. Current playable bet

- **Appetite:** hours or days, never “until complete.”
- **Player-visible outcome:**
- **Smallest complete loop:**
- **Primary browser/playtest proof:**
- **Supporting automated checks:**
- **Stop rule:**

## 10. Cut order

When the appetite is threatened, cut in this exact order:

1.
2.
3.

Name what is protected even when everything else is cut.

## 11. Playtest questions

Use observable questions:

- Can the player state the goal?
- What do they try first?
- Where do they hesitate or misread feedback?
- Do they reach a meaningful decision quickly?
- Can they explain why they won or lost?
- Do they voluntarily restart?

Record observations, not an agent's guess about what players will feel.

## 12. Release evidence

- playable URL or local command;
- supported input/device matrix;
- observed playtest notes;
- screenshots/video;
- automated test command and result;
- known limits;
- rollback/eject proof;
- owner release decision.

## 13. Future vision

Park expansion here. Future vision is not current scope until a new finite bet promotes part of it.