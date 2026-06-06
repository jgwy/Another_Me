/**
 * The living world (refactor plan §9).
 *
 * A full-bleed, immersive map where the user's twin — a little travel frog —
 * thinks at home, sets out, crosses the world, meets other twins, talks, and
 * returns. The world is rendered as two stacked, pixel-aligned SVG layers:
 *
 *   - `WorldMap`   — the static world (ground, routes, districts, plaza, home,
 *                    partners, ambient residents). Memoized; never re-renders
 *                    on the per-frame journey tick.
 *   - `TravelFrog` — the live layer, driven every frame by `useJourneySimulation`
 *                    so the frog animates across the map at 60fps.
 *
 * Clicking an encounter (a partner, the frog, or a panel row) *focuses* it to
 * spectate/read — it never dispatches. Buildings are status surfaces only.
 *
 * Data seam: everything renders against the typed trips mock via `useActiveTrip`
 * + `useJourneySimulation`. At integration, swap those for the real
 * `/api/trips` list + the journey SSE stream — the visualization is unchanged.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { ScenarioKey } from "../../lib/api";
import { useDemoMode } from "../../lib/queries";
import { isActiveTrip, useActiveTrip, useTripJourney } from "../../lib/trips";
import { useAuthStore } from "../../store/auth";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { Button } from "../../components/ui/Button";
import { BUILDING_ORDER, isSceneKey } from "./worldLayout";
import { WorldMap } from "./WorldMap";
import type { WorldScene } from "./WorldMap";
import type { BuildingTone } from "./WorldBuilding";
import { TravelFrog } from "./TravelFrog";
import { JourneyPanel } from "./JourneyPanel";
import { EncounterFocus } from "./EncounterFocus";

export function IslandPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(["island", "common"]);
  const user = useAuthStore((s) => s.user);
  const demo = useDemoMode();
  const reduce = useReducedMotion() ?? false;

  const { trip } = useActiveTrip();
  // The unified live driver: SSE for real trips, simulator for mock/demo trips.
  const journey = useTripJourney(trip, { enabled: !reduce });

  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  // Coerce each encounter's (possibly unknown) scenario_key to a world building,
  // keeping a stable building per leg so the frog's route is well-defined.
  const encKeys = useMemo<ScenarioKey[]>(
    () =>
      journey.encounters.map((e, i) =>
        isSceneKey(e.scenario_key) ? e.scenario_key : BUILDING_ORDER[i % BUILDING_ORDER.length]!,
      ),
    [journey.encounters],
  );

  // Per-building view model, derived from the trip's truth (done/active/upcoming).
  // Memoized so the static WorldMap never re-renders on the journey tick.
  const scenes = useMemo<WorldScene[]>(() => {
    const active = isActiveTrip(trip);
    return BUILDING_ORDER.map((key) => {
      const idx = journey.encounters.findIndex((_, i) => encKeys[i] === key);
      const enc = idx >= 0 ? journey.encounters[idx] : undefined;
      if (!trip || !enc) {
        return {
          key,
          name: t(`island:scenarios.${key}`),
          statusLabel: t("island:world.openScene"),
          tone: "idle" as BuildingTone,
          encounterIndex: null,
          partnerName: null,
          partnerAvatar: null,
          done: false,
        };
      }
      const done = enc.status === "completed" || (active && enc.seq < journey.activeIndex);
      const isActive = active && !done && enc.seq === journey.activeIndex;
      const tone: BuildingTone = done ? "done" : isActive ? "active" : "upcoming";
      const statusLabel = done
        ? t("common:status.completed")
        : isActive
          ? t(`island:journey.status.${journey.agentStatus}`)
          : t("common:status.queued");
      return {
        key,
        name: t(`island:scenarios.${key}`),
        statusLabel,
        tone,
        encounterIndex: enc.seq,
        partnerName: enc.opponent?.name ?? null,
        partnerAvatar: enc.opponent?.avatar ?? null,
        done,
      };
    });
  }, [trip, journey.encounters, journey.activeIndex, journey.agentStatus, encKeys, t]);

  const focused = useMemo(
    () => (trip && focusIndex !== null ? journey.encounters.find((e) => e.seq === focusIndex) : undefined),
    [trip, journey.encounters, focusIndex],
  );

  const onFocusEncounter = useCallback((index: number) => setFocusIndex(index), []);
  const onClose = useCallback(() => setFocusIndex(null), []);
  const onSpectate = useCallback((cid: string) => navigate(`/conversations/${cid}`), [navigate]);
  const onReport = useCallback((cid: string) => navigate(`/conversations/${cid}/report`), [navigate]);
  const onDispatch = useCallback(() => navigate("/dispatch"), [navigate]);
  const onBuildTwin = useCallback(() => navigate("/agents/new"), [navigate]);
  const onViewTrip = useCallback(() => {
    if (trip) navigate(`/trips/${trip.id}`);
  }, [navigate, trip]);

  const welcome = user?.username
    ? t("island:welcomeNamed", { name: user.username })
    : t("island:welcome");

  const panel = (
    <JourneyPanel
      trip={trip}
      liveStatus={journey.agentStatus}
      liveIndex={journey.activeIndex}
      onFocusEncounter={onFocusEncounter}
      onDispatch={onDispatch}
      reduce={reduce}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Full-bleed immersive world (self-contained; does not touch the shell). */}
      <section className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6">
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.99 }}
            animate={reduce ? undefined : { opacity: 1, scale: 1 }}
            transition={spring.soft}
            className="world-canvas world-vignette relative h-[82vh] min-h-[560px] overflow-hidden rounded-3xl border border-border/60 shadow-float"
          >
            <WorldMap
              scenes={scenes}
              homeLabel={t("island:world.home")}
              plazaLabel={t("island:world.plaza")}
              reduce={reduce}
              onFocusEncounter={onFocusEncounter}
            />
            <TravelFrog
              keys={encKeys}
              status={journey.agentStatus}
              encounterIndex={journey.activeIndex}
              progress={journey.progress}
              reduce={reduce}
              onFocus={onFocusEncounter}
            />

            {/* top HUD: identity + actions */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-5 sm:p-6">
              <motion.div
                variants={reduce ? undefined : staggerContainer(0.06)}
                initial={reduce ? undefined : "hidden"}
                animate={reduce ? undefined : "show"}
                className="max-w-md"
              >
                <motion.div variants={reduce ? undefined : fadeUp} className="text-xs font-medium uppercase tracking-wider text-faint">
                  {t("island:eyebrow")}
                </motion.div>
                <motion.h1
                  variants={reduce ? undefined : fadeUp}
                  className="text-balance mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
                >
                  {welcome}
                </motion.h1>
                <motion.p variants={reduce ? undefined : fadeUp} className="text-balance mt-2 hidden max-w-sm text-sm leading-relaxed text-muted sm:block">
                  {t("island:subtitle")}
                </motion.p>
              </motion.div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {demo && (
                  <span className="pointer-events-auto rounded-full bg-surface-2/80 px-2.5 py-1 text-xs text-faint ring-1 ring-border/60 backdrop-blur">
                    {t("common:demo.hint")}
                  </span>
                )}
                <div className="pointer-events-auto hidden gap-2 sm:flex">
                  {trip && (
                    <Button variant="ghost" size="sm" onClick={onViewTrip}>
                      {t("island:journey.viewTrip")}
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={onBuildTwin}>
                    {t("island:cta.buildTwin")}
                  </Button>
                  <Button size="sm" onClick={onDispatch}>
                    {t("island:cta.dispatch")}
                  </Button>
                </div>
              </div>
            </div>

            {/* journey HUD panel (lg+) */}
            <div className="pointer-events-none absolute bottom-5 right-5 top-32 hidden w-[330px] lg:block">
              <div className="pointer-events-auto flex h-full flex-col justify-end">{panel}</div>
            </div>

            {/* mobile actions */}
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex justify-center gap-2 p-5 sm:hidden">
              <Button variant="secondary" size="sm" onClick={onBuildTwin}>
                {t("island:cta.buildTwin")}
              </Button>
              <Button size="sm" onClick={onDispatch}>
                {t("island:cta.dispatch")}
              </Button>
            </div>

            {/* focused encounter */}
            <AnimatePresence>
              {focused && (
                <EncounterFocus
                  key={focused.id}
                  encounter={focused}
                  onClose={onClose}
                  onSpectate={onSpectate}
                  onReport={onReport}
                  reduce={reduce}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* journey panel below the world on smaller screens */}
      <div className="lg:hidden">{panel}</div>
    </div>
  );
}
