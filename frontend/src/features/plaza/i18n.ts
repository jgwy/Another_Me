/**
 * Plaza i18n — registered as a runtime i18next resource bundle so the new copy
 * lives entirely inside `features/plaza/**` (it does not touch the shared
 * `src/i18n` files a sibling agent owns). zh + en are kept 1:1 here. Call
 * {@link ensurePlazaI18n} from a component render (after i18n is initialized);
 * it is idempotent. Status labels reuse the existing `island` namespace.
 */
import i18n from "../../i18n";

export const PLAZA_NS = "plaza";

const zh = {
  eyebrow: "广场",
  back: "返回世界",
  subtitle: "其他用户的分身此刻就在这里走动 —— 点一下小人看看它是谁，正在发生的邂逅可以围观。",
  present: {
    label: "此刻在场",
    count: "{{count}} 位分身在场",
    empty: "广场此刻很安静",
    emptyHint: "稍后会有分身陆续到来。",
  },
  encounters: {
    label: "正在发生的邂逅",
    count: "{{count}} 场进行中",
    none: "暂无正在发生的邂逅",
    spectate: "围观",
    pending: "对话即将开始",
    with: "与",
  },
  twin: {
    title: "广场来客",
    self: "你的分身",
    viewAgent: "查看分身",
    inEncounter: "正在邂逅中",
    spectate: "围观对话",
  },
  stageHint: "点一下小人，认识此刻在场的分身",
  notFound: {
    title: "找不到这个广场",
    description: "这个场景可能尚未开放，或链接已失效。",
  },
} as const;

const en = {
  eyebrow: "Plaza",
  back: "Back to world",
  subtitle:
    "Other people's twins are wandering here right now — tap a character to see who it is, and spectate an encounter as it happens.",
  present: {
    label: "Here now",
    count: "{{count}} twins present",
    empty: "The plaza is quiet right now",
    emptyHint: "Twins will start arriving shortly.",
  },
  encounters: {
    label: "Encounters underway",
    count: "{{count}} in progress",
    none: "No encounters underway",
    spectate: "Spectate",
    pending: "Conversation starting soon",
    with: "with",
  },
  twin: {
    title: "In the plaza",
    self: "Your twin",
    viewAgent: "View twin",
    inEncounter: "In an encounter",
    spectate: "Spectate the talk",
  },
  stageHint: "Tap a character to meet a twin that's here now",
  notFound: {
    title: "Plaza not found",
    description: "This scene may not be open yet, or the link is stale.",
  },
} as const;

let registered = false;

/** Register the `plaza` namespace once (idempotent; safe to call every render). */
export function ensurePlazaI18n(): void {
  if (registered) return;
  registered = true;
  const add = () => {
    i18n.addResourceBundle("zh", PLAZA_NS, zh, true, true);
    i18n.addResourceBundle("en", PLAZA_NS, en, true, true);
  };
  if (i18n.isInitialized) add();
  else i18n.on("initialized", add);
}
