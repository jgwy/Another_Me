/**
 * The living world (refactor plan §7) — a light **2.5D isometric** map.
 *
 * Buildings render from the **dynamic scenario list** (`scenario.meta` coords),
 * not a hardcoded set, so a user-created scene shows up the moment it exists.
 * The user's twin is a little character (小人) that thinks at home, sets out,
 * crosses the world, meets, talks, and returns — driven by the journey tick.
 * Clicking a building **enters its plaza**; clicking the twin (or a panel row)
 * focuses that encounter to spectate / read.
 *
 * Two stacked SVG layers keep it cheap: `IsoWorld` (static, memoized — ground,
 * routes, plaza, ambient residents, buildings) and `IsoTraveler` (the live hero,
 * the only thing that ticks per frame). Data comes from `useScenarios` +
 * `useActiveTrip` / `useTripJourney`, each real-endpoint-first with a typed-mock
 * fallback, so the world is alive before the backend lands.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { Scenario } from "../../lib/api";
import { useDemoMode, useScenarios } from "../../lib/queries";
import { isActiveTrip, useActiveTrip, useTripJourney } from "../../lib/trips";
import { useAuthStore } from "../../store/auth";
import { fadeUp, spring, staggerContainer } from "../../lib/anim";
import { Button } from "../../components/ui/Button";
import { computeIsoLayout } from "./iso";
import { IsoWorld } from "./IsoWorld";
import type { BuildingScene } from "./IsoWorld";
import type { BuildingTone } from "./IsoBuilding";
import { IsoTraveler } from "./IsoTraveler";
import { isSceneKey } from "./worldLayout";
import { JourneyPanel } from "./JourneyPanel";
import { EncounterFocus } from "./EncounterFocus";

export function IslandPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(["island", "common"]);
  const user = useAuthStore((s) => s.user);
  const demo = useDemoMode();
  const reduce = useReducedMotion() ?? false;

  const { data: scenarios } = useScenarios();
  const layout = useMemo(() => computeIsoLayout(scenarios ?? []), [scenarios]);

  const { trip } = useActiveTrip();
  const journey = useTripJourney(trip, { enabled: !reduce });

  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const shortName = useCallback(
    (s: Scenario): string => {
      if (isSceneKey(s.key)) return t(`island:scenarios.${s.key}`);
      const seg = s.name.split("·")[0]?.trim();
      return seg || s.name;
    },
    [t],
  );

  // Per-building view model (idle / active / done / upcoming), derived from the
  // trip's truth. Memoized so the static world never re-renders on the tick.
  const scenes = useMemo<Map<string, BuildingScene>>(() => {
    const map = new Map<string, BuildingScene>();
    const active = isActiveTrip(trip);
    for (const b of layout.buildings) {
      const enc = trip ? journey.encounters.find((e) => e.scenario_id === b.scenario.id) : undefined;
      let tone: BuildingTone = "idle";
      let statusLabel = t("island:world.openScene");
      if (trip && enc) {
        const done = enc.status === "completed" || (active && enc.seq < journey.activeIndex);
        const isActive = active && !done && enc.seq === journey.activeIndex;
        tone = done ? "done" : isActive ? "active" : "upcoming";
        statusLabel = done
          ? t("common:status.completed")
          : isActive
            ? t(`island:journey.status.${journey.agentStatus}`)
            : t("common:status.queued");
      }
      map.set(b.scenario.id, { name: shortName(b.scenario), statusLabel, tone });
    }
    return map;
  }, [layout, trip, journey.encounters, journey.activeIndex, journey.agentStatus, t, shortName]);

  // The hero's route: each encounter's building anchor (fallback by order).
  const route = useMemo(() => {
    const n = Math.max(1, layout.buildings.length);
    const anchors = journey.encounters.map((e, i) => {
      const b = layout.byScenarioId.get(e.scenario_id) ?? layout.buildings[i % n];
      return b ? b.anchor : layout.plaza;
    });
    return { home: layout.home, plaza: layout.plaza, anchors };
  }, [layout, journey.encounters]);

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
  const onCreateScenario = useCallback(() => navigate("/scenarios/new"), [navigate]);
  const onEnterPlaza = useCallback((scenarioId: string) => navigate(`/plaza/${scenarioId}`), [navigate]);
  const onViewTrip = useCallback(() => {
    if (trip) navigate(`/trips/${trip.id}`);
  }, [navigate, trip]);

  const twinName = trip?.agent?.name ?? user?.username ?? "我的分身";
  const twinAvatar = trip?.agent?.avatar ?? null;
  const welcome = user?.username ? t("island:welcomeNamed", { name: user.username }) : t("island:welcome");

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
            <IsoWorld
              layout={layout}
              scenes={scenes}
              homeLabel={t("island:world.home")}
              plazaLabel={t("island:world.plaza")}
              reduce={reduce}
              onEnter={onEnterPlaza}
            />
            <IsoTraveler
              route={route}
              status={journey.agentStatus}
              encounterIndex={journey.activeIndex}
              progress={journey.progress}
              reduce={reduce}
              twinName={twinName}
              twinAvatar={twinAvatar}
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
                  <Button variant="ghost" size="sm" onClick={onCreateScenario}>
                    {t("island:cta.createScenario")}
                  </Button>
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
              <Button variant="ghost" size="sm" onClick={onCreateScenario}>
                {t("island:cta.createScenario")}
              </Button>
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
