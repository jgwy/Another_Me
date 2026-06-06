/**
 * Wizard configuration + the questionnaire → {@link AgentCreate} mapper.
 *
 * The "捏脸" (build-a-twin) flow collects answers into a single {@link WizardForm}
 * shape, then `buildAgentCreate` projects them into the exact request body the
 * backend (and the typed mock fallback in `lib/mocks.ts`) expects. Keeping the
 * mapping in one place makes the wizard UI dumb and the contract obvious.
 */
import type { AgentCreate, UploadedSkill } from "../../lib/api";

/* -------------------------------------------------------------------------- */
/* Option sets                                                                 */
/* -------------------------------------------------------------------------- */

/** Emoji palette for the avatar picker (users can also paste their own / a URL). */
export const EMOJI_SET: string[] = [
  "🦊", "🐼", "🦉", "🐙", "🦄", "🐝", "🦋", "🐢",
  "🦒", "🐬", "🦝", "🐳", "🤖", "🧠", "✨", "🔮",
  "💼", "🚀", "☕", "📚", "💻", "🧪", "🌙", "📊",
];

/** Quick-pick domains — the field stays free-text so anything is allowed. */
export const DOMAIN_SUGGESTIONS: string[] = [
  "fintech",
  "software",
  "data",
  "design",
  "education",
  "healthcare",
  "research",
  "marketing",
  "hospitality",
  "personal",
];

/** Personality traits offered as toggleable chips (custom traits allowed too). */
export const PERSONALITY_OPTIONS: string[] = [
  "analytical",
  "direct",
  "empathetic",
  "creative",
  "optimistic",
  "rigorous",
  "curious",
  "patient",
  "warm",
  "witty",
  "driven",
  "calm",
  "bold",
  "meticulous",
  "playful",
  "introspective",
];

/** Voice quick-picks for the `tone` field (also free-text). */
export const TONE_SUGGESTIONS: string[] = [
  "thoughtful",
  "sharp & fair",
  "energetic & candid",
  "gentle & observant",
  "warm & thoughtful",
  "wry & direct",
  "precise & calm",
  "tender & honest",
];

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

export interface WizardStep {
  /** Stable, ASCII step id. Human-readable labels live in the `create` i18n
   *  namespace under `steps.<id>.{title,short,description}`. */
  id: string;
}

export const STEPS: WizardStep[] = [
  { id: "identity" },
  { id: "domain" },
  { id: "voice" },
  { id: "social" },
  { id: "skills" },
  { id: "review" },
];

/* -------------------------------------------------------------------------- */
/* Form state                                                                  */
/* -------------------------------------------------------------------------- */

export interface WizardForm {
  name: string;
  /** Emoji or an image URL. Empty → auto-assigned by the backend/mock. */
  avatar: string;
  domain: string;
  personality: string[];
  /** Comma / newline separated free text → split into tags on submit. */
  interests: string;
  tone: string;
  dos: string[];
  donts: string[];
  maxRounds: number;
  isPublic: boolean;
  goals: string;
  /** Optional persona override; blank lets the twin auto-generate one. */
  persona: string;
  skills: UploadedSkill[];
}

export const INITIAL_FORM: WizardForm = {
  name: "",
  avatar: "",
  domain: "",
  personality: [],
  interests: "",
  tone: "",
  dos: [],
  donts: [],
  maxRounds: 8,
  isPublic: false,
  goals: "",
  persona: "",
  skills: [],
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Split a comma/newline list into clean, de-duplicated tokens. */
export function splitList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const token = raw.trim();
    if (token && !seen.has(token.toLowerCase())) {
      seen.add(token.toLowerCase());
      out.push(token);
    }
  }
  return out;
}

/** Keep only skills that have both a name and content. */
export function cleanSkills(skills: UploadedSkill[]): UploadedSkill[] {
  return skills
    .map((s) => ({ name: s.name.trim(), content: s.content.trim() }))
    .filter((s) => s.name && s.content);
}

/**
 * Per-step validation. Returns a `create`-namespace i18n key when the step is
 * incomplete (the caller resolves it with `t()`), or `null` when the user may
 * advance. Only the first two steps gate progress; everything else is optional
 * by design.
 */
export function validateStep(step: number, form: WizardForm): string | null {
  const id = STEPS[step]?.id;
  if (id === "identity") {
    if (!form.name.trim()) return "validation.nameRequired";
    if (form.name.trim().length < 2) return "validation.nameTooShort";
  }
  if (id === "domain") {
    if (!form.domain.trim()) return "validation.domainRequired";
  }
  return null;
}

/** Map the collected answers into the exact `AgentCreate` request body. */
export function buildAgentCreate(form: WizardForm): AgentCreate {
  const persona = form.persona.trim();
  const questionnaire: Record<string, unknown> = {
    domain: form.domain.trim(),
    personality: form.personality,
    interests: splitList(form.interests),
    goals: form.goals.trim(),
    tone: form.tone.trim(),
    dos: form.dos,
    donts: form.donts,
  };
  if (persona) questionnaire.persona = persona;

  const avatar = form.avatar.trim();

  return {
    name: form.name.trim(),
    questionnaire,
    uploaded_skills: cleanSkills(form.skills),
    max_rounds: form.maxRounds,
    is_public: form.isPublic,
    avatar: avatar ? avatar : null,
  };
}
