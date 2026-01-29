# Solar Sail Piloting Guide

## Controls

| Control | Keys | Range |
|---------|------|-------|
| Sail Angle | `[` / `]` | -90° to +90° (±5° per press) |
| Deployment | `-` / `=` | 0% to 100% (±10% per press) |

## Sail Angle

The sail angle determines thrust direction:

| Angle | Effect |
|-------|--------|
| **-35°** | Retrograde thrust - **lowers orbit** (fall toward sun) |
| **0°** | Pure radial thrust - pushes straight away from sun |
| **+35°** | Prograde thrust - **raises orbit** (climb away from sun) |
| **±90°** | Edge-on to sun - zero thrust (coasting) |

**Key insight:** ±35° maximizes tangential thrust for orbit changes.

## Raising Your Orbit (Going Outward)

1. Deploy sail to 100%
2. Set angle to **+35°**
3. The prograde thrust adds orbital energy, spiraling you outward

## Lowering Your Orbit (Coming Back)

1. Deploy sail to 100%
2. Set angle to **-35°**
3. The retrograde thrust removes orbital energy, spiraling you inward

## Thrust Output

Your acceleration depends on:
- **Distance from sun**: Thrust ∝ 1/r² (closer = stronger)
- **Sail deployment**: Linear scaling
- **Sail angle**: Thrust ∝ cos²(angle)

| Distance | Relative Thrust |
|----------|-----------------|
| 0.5 AU | 4× baseline |
| 1 AU | baseline |
| 2 AU | 0.25× baseline |
| 5 AU | 0.04× baseline |

## Quick Reference

| Goal | Deployment | Angle |
|------|------------|-------|
| Raise orbit (go outward) | 100% | +35° |
| Lower orbit (come back) | 100% | -35° |
| Coast (no thrust) | 0% | any |
| Maximum outward push | 100% | 0° |
