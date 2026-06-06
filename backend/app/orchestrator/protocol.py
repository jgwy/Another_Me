"""Pure turn-protocol planner (R12–R14).

Deterministic and DB-free so it can be unit-tested directly (AE1). A conversation
between two agents runs for ``n = min(max_rounds)`` rounds, i.e. ``2n`` dialogues
``[对话1..2n]`` with strict alternation (agent1 on odd turns, agent2 on even).
When two rounds remain, the ending prompt is injected (merged with the prior
agent2 output) into agent1 and stays active until the end.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TurnStep:
    turn_index: int  # 1-based dialogue number [对话k], 1..2n
    seat: int  # 1 (agent1) or 2 (agent2)
    ending_active: bool  # whether the ending prompt is injected for this turn


def compute_rounds(max_rounds: list[int]) -> int:
    """n = the minimum of the participants' max_rounds (clamped to >= 1)."""
    valid = [m for m in max_rounds if isinstance(m, int) and m > 0]
    if not valid:
        return 1
    return max(1, min(valid))


def ending_start_turn(n: int) -> int:
    """First dialogue turn at which the ending prompt is injected.

    "When 2 rounds remain" → start of round (n-1) → dialogue ``2n-3``. For very
    short conversations (n <= 1) this clamps to turn 1 so they wind down at once.
    """
    return max(1, 2 * n - 3)


def plan_turns(n: int) -> list[TurnStep]:
    """Return the ordered turn plan for ``n`` rounds (``2n`` dialogues)."""
    total = 2 * n
    ending_from = ending_start_turn(n)
    return [
        TurnStep(turn_index=t, seat=1 if t % 2 == 1 else 2, ending_active=t >= ending_from)
        for t in range(1, total + 1)
    ]
