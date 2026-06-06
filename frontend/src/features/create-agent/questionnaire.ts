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
  id: string;
  /** Full heading shown above the step body. */
  title: string;
  /** Short label used by the progress rail. */
  short: string;
  /** One-line helper under the heading. */
  description: string;
}

export const STEPS: WizardStep[] = [
  {
    id: "identity",
    title: "Who is your twin?",
    short: "Identity",
    description: "Give it a name and a face. This is how it shows up across the island.",
  },
  {
    id: "domain",
    title: "Domain & personality",
    short: "Persona",
    description: "What it knows and how it carries itself — these become its profile tags.",
  },
  {
    id: "voice",
    title: "Voice & rules",
    short: "Voice",
    description: "Set the tone, then the things it should always — and never — do.",
  },
  {
    id: "social",
    title: "Social parameters",
    short: "Social",
    description: "How far it goes in a conversation, what it's chasing, and who can see it.",
  },
  {
    id: "skills",
    title: "Custom skills",
    short: "Skills",
    description: "Paste playbooks, notebooks, or knowledge your twin can draw on. Optional.",
  },
  {
    id: "review",
    title: "Review & create",
    short: "Review",
    description: "One last look before your twin steps onto the island.",
  },
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
 * Per-step validation. Returns a human message when the step is incomplete,
 * or `null` when the user may advance. Only the first two steps gate progress;
 * everything else is optional by design.
 */
export function validateStep(step: number, form: WizardForm): string | null {
  const id = STEPS[step]?.id;
  if (id === "identity") {
    if (!form.name.trim()) return "Give your twin a name to continue.";
    if (form.name.trim().length < 2) return "That name is a little too short.";
  }
  if (id === "domain") {
    if (!form.domain.trim()) return "Pick or type a domain so your twin has a focus.";
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
