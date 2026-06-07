/**
 * The plaza read-out beside the stage: who is present now (click a row to focus
 * that twin) and the encounters underway (spectate the live conversation). Pure
 * presentation over the live presence — no animation beyond a soft list fade.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { JOURNEY_COLOR } from "../island/worldLayout";
import type { PlazaEncounter, PresenceTwin } from "./presence";

export interface PlazaPanelProps {
  present: PresenceTwin[];
  encounters: PlazaEncounter[];
  onSelect: (twin: PresenceTwin) => void;
  onSpectate: (conversationId: string) => void;
}

function PlazaPanelImpl({ present, encounters, onSelect, onSpectate }: PlazaPanelProps) {
  const { t } = useTranslation(["plaza", "island", "common"]);

  return (
    <div className="flex flex-col gap-4">
      {/* present twins */}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-tight text-ink">{t("plaza:present.label")}</h3>
          <span className="text-xs text-faint">{t("plaza:present.count", { count: present.length })}</span>
        </div>

        {present.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center">
            <p className="text-sm text-muted">{t("plaza:present.empty")}</p>
            <p className="mt-1 text-xs text-faint">{t("plaza:present.emptyHint")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {present.map((tw) => {
              const color = tw.is_self ? "var(--color-brand)" : JOURNEY_COLOR[tw.status];
              return (
                <li key={tw.agent_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(tw)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-surface-2/40 px-3 py-2 text-left transition-colors hover:bg-surface-2/80"
                  >
                    <Avatar name={tw.agent.name} avatar={tw.agent.avatar} size="xs" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-ink">{tw.agent.name}</span>
                        {tw.is_self && (
                          <span className="chip shrink-0" style={{ color: "var(--color-brand)" }}>
                            {t("plaza:twin.self")}
                          </span>
                        )}
                      </div>
                      {tw.agent.profile_tags?.[0] && (
                        <p className="truncate text-xs text-faint">{tw.agent.profile_tags.slice(0, 2).join(" · ")}</p>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[0.7rem]" style={{ color }}>
                      <span className="status-dot" style={{ color }} />
                      {t(`island:journey.status.${tw.status}`)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* encounters underway */}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-tight text-ink">{t("plaza:encounters.label")}</h3>
          <span className="text-xs text-faint">{t("plaza:encounters.count", { count: encounters.length })}</span>
        </div>

        {encounters.length === 0 ? (
          <p className="text-sm text-faint">{t("plaza:encounters.none")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {encounters.map((enc) => {
              const names = enc.participants.map((p) => p.name).join(` ${t("plaza:encounters.with")} `);
              return (
                <li key={enc.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface-2/40 px-3 py-2.5">
                  <div className="flex shrink-0 -space-x-2">
                    {enc.participants.slice(0, 2).map((p) => (
                      <Avatar key={p.id} name={p.name} avatar={p.avatar} size="xs" className="ring-2 ring-surface" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{names}</p>
                  </div>
                  {enc.conversation_id ? (
                    <Button size="sm" variant="secondary" onClick={() => onSpectate(enc.conversation_id!)}>
                      {t("plaza:encounters.spectate")}
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-faint">{t("plaza:encounters.pending")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export const PlazaPanel = memo(PlazaPanelImpl);
