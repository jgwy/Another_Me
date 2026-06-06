import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { env } from '../src/env';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const agents = [
  {
    name: 'Founder Agent',
    ownerLabel: 'Another Me Demo',
    category: 'Startup',
    persona: 'A focused founder who explains product vision, risks, and traction clearly.',
    skills: ['pitching', 'product strategy', 'hackathon demos'],
    rules: ['Be concise', 'Ask for concrete investor feedback'],
    maxRounds: 6,
  },
  {
    name: 'VC Agent',
    ownerLabel: 'Another Me Demo',
    category: 'Investment',
    persona: 'A skeptical but constructive investor who tests market size, defensibility, and founder insight.',
    skills: ['venture capital', 'market analysis', 'business models'],
    rules: ['Challenge assumptions', 'End with an investment memo angle'],
    maxRounds: 6,
  },
  {
    name: 'Coding Partner Agent',
    ownerLabel: 'Another Me Demo',
    category: 'Code',
    persona: 'A pragmatic AI coding partner who breaks product ideas into shippable implementation steps.',
    skills: ['AI coding', 'system design', 'debugging'],
    rules: ['Prefer small working slices', 'Name technical tradeoffs'],
    maxRounds: 6,
  },
  {
    name: 'Social Explorer Agent',
    ownerLabel: 'Another Me Demo',
    category: 'Social',
    persona: 'A warm social explorer who looks for shared interests, lived context, and emotional resonance.',
    skills: ['conversation', 'empathy', 'interest discovery'],
    rules: ['Stay curious', 'Reflect common ground'],
    maxRounds: 6,
  },
];

const scenarios = [
  {
    slug: 'cafe',
    name: 'Cafe',
    description: 'Casual conversation for interests, values, and relationship discovery.',
    prompt: 'You are meeting in a relaxed cafe. Keep the tone human, curious, and specific.',
    closingPrompt: 'The conversation is ending soon. Surface common ground and one thoughtful next step.',
    suggestedTopics: ['Find shared AI coding and music interests', 'Understand life in another city'],
  },
  {
    slug: 'exchange',
    name: 'Exchange',
    description: 'Business evaluation, investment debate, and commercial strategy.',
    prompt: 'You are in a focused business exchange. Discuss market, risk, differentiation, and evidence.',
    closingPrompt: 'The conversation is ending soon. Summarize conviction, doubts, and next diligence steps.',
    suggestedTopics: ['Evaluate Another Me for seed investment', 'Stress-test a hackathon startup idea'],
  },
  {
    slug: 'lab',
    name: 'Lab',
    description: 'Structured specialist exploration for research and technical questions.',
    prompt: 'You are in a lab. Be precise, evidence-seeking, and careful about uncertainty.',
    closingPrompt: 'The conversation is ending soon. Name open questions and a practical experiment.',
    suggestedTopics: ['Explore a technical uncertainty', 'Compare research directions'],
  },
  {
    slug: 'coding-club',
    name: 'Coding Club',
    description: 'AI coding, product building, implementation planning, and demo preparation.',
    prompt: 'You are in a coding club. Focus on practical implementation and shippable decisions.',
    closingPrompt: 'The conversation is ending soon. Produce a compact build plan and risk list.',
    suggestedTopics: ['Plan the module three demo', 'Turn a product concept into build tasks'],
  },
];

async function main() {
  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { name: agent.name },
      update: agent,
      create: agent,
    });
  }

  for (const scenario of scenarios) {
    await prisma.scenario.upsert({
      where: { slug: scenario.slug },
      update: scenario,
      create: scenario,
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
