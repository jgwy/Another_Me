/**
 * Seed snippets for the standalone sandbox workspace. Each snippet is plain,
 * valid Python whose visible output comes entirely from `print("…")` string
 * literals — so it renders identically under the typed demo mock (which echoes
 * those literals) and under real execution once the run endpoint lands.
 *
 * `id` maps to an `examples.<id>` i18n key for the loader button label.
 */
export interface SandboxExample {
  id: string;
  icon: string;
  language: string;
  code: string;
}

export const SANDBOX_EXAMPLES: SandboxExample[] = [
  {
    id: "growth",
    icon: "📈",
    language: "python",
    code: `# 觅见.AI · weekly growth pulse
print("== Weekly Growth Pulse ==")
print("Latest week signups: 233")
print("Week over week: +18.3%")
print("6-week total: 1001")
print("Call: momentum is healthy — scale spend.")
`,
  },
  {
    id: "icebreaker",
    icon: "💬",
    language: "python",
    code: `# 觅见.AI · social twin icebreaker
print("Hi, I'm Aria's twin 👋")
print("Heard you're into indie games too?")
print("I've been hooked on Hollow Knight — you?")
`,
  },
];
