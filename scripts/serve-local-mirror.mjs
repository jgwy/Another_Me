import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', 'site')
const modulePartsRoot = path.resolve(__dirname, '..', 'modules')
const modulesRoot = path.resolve(__dirname, '..', 'modules', 'web')
const dataDir = path.resolve(__dirname, '..', 'data')
const agentsFile = path.join(dataDir, 'uploaded-agents.json')
const moduleAgentsFile = path.join(dataDir, 'module-agent-launch-agents.json')
const avatarProfilesFile = path.join(dataDir, 'module-avatar-profiles.json')
const socialConversationsFile = path.join(dataDir, 'module-social-conversations.json')
const port = Number(process.env.PORT || 4174)

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}


const json = (res, body, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
  return true
}

const readJsonBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

const text = (value, max = 500) => String(value || '').trim().slice(0, max)

const defaultUploadedAgents = [
  {
    id: 'local-demo-research-agent',
    name: 'Research Buddy Agent',
    owner: 'Local Demo',
    tagline: 'A sample uploaded agent that other users can open.',
    description: 'Summarizes papers, drafts outreach, and answers questions from a hosted chat endpoint.',
    chatUrl: 'https://example.com/agent-chat',
    apiUrl: '',
    demoVideoUrl: '',
    category: 'Research',
    created_at: new Date().toISOString(),
  },
]

const loadUploadedAgents = async () => {
  try {
    return JSON.parse(await fs.readFile(agentsFile, 'utf8'))
  } catch {
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(agentsFile, JSON.stringify(defaultUploadedAgents, null, 2))
    return defaultUploadedAgents
  }
}

const saveUploadedAgents = async (agents) => {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(agentsFile, JSON.stringify(agents, null, 2))
}

const loadJsonFile = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(file, JSON.stringify(fallback, null, 2))
    return fallback
  }
}

const saveJsonFile = async (file, value) => {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(file, JSON.stringify(value, null, 2))
}

const makeUploadedAgent = (body) => ({
  id: crypto.randomUUID(),
  name: text(body.name, 80),
  owner: text(body.owner, 80),
  tagline: text(body.tagline, 160),
  description: text(body.description, 1200),
  chatUrl: text(body.chatUrl, 400),
  apiUrl: text(body.apiUrl, 400),
  demoVideoUrl: text(body.demoVideoUrl, 400),
  category: text(body.category, 80) || 'General',
  created_at: new Date().toISOString(),
})

const makeModuleAgent = (body) => ({
  ...makeUploadedAgent(body),
  repoUrl: text(body.repoUrl, 400),
  eventName: text(body.eventName, 120),
  status: text(body.status, 80) || 'submitted',
})

const makeAvatarProfile = (body) => {
  const agentName = text(body.agentName, 80)
  const role = text(body.role, 120)
  const personality = text(body.personality, 500)
  const visualStyle = text(body.visualStyle, 500)
  const color = text(body.color, 80)
  const expertise = text(body.expertise, 200)
  const hobbies = Array.isArray(body.hobbies)
    ? body.hobbies.map((h) => text(h, 80)).filter(Boolean).slice(0, 12)
    : []
  const questionnaire = (body.questionnaire && typeof body.questionnaire === 'object' && !Array.isArray(body.questionnaire))
    ? Object.fromEntries(
        Object.entries(body.questionnaire).slice(0, 40)
          .map(([k, v]) => [text(k, 80), text(v, 500)])
          .filter(([k, v]) => k && v),
      )
    : {}

  const persona = `Persona: ${agentName} is a ${role}. Personality: ${personality}.`
  const skills = `Skills: expertise in ${expertise || role}. Hobbies / interests: ${hobbies.join(', ') || 'general'}.`
  const rules = `Rules: stay in character; speak in a tone matching the personality; do not invent facts about the user beyond this profile.`
  const imagePrompt = `Visual brief — ${visualStyle}. Color direction: ${color || 'unspecified'}. Subject: ${agentName} (${role}).`

  return {
    id: crypto.randomUUID(),
    agentName,
    role,
    personality,
    visualStyle,
    color,
    expertise,
    hobbies,
    questionnaire,
    persona,
    skills,
    rules,
    imagePrompt,
    prompt: [persona, skills, rules, imagePrompt].join('\n\n'),
    created_at: new Date().toISOString(),
  }
}

const mockApi = async (req, res, requestUrl) => {
  if (!requestUrl.pathname.startsWith('/api/')) return false
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    })
    res.end()
    return true
  }

  const now = new Date().toISOString()
  const merchant = {
    id: 'local-merchant',
    api_key: 'local_demo_merchant_key',
    company_name: 'Xuanming Liu',
    name: 'Xuanming Liu',
    email: 'demo@anotherme.local',
    role: 'merchant',
    balance: 0,
    credit_balance: 0,
    credits: 0,
    created_at: now,
  }
  const dashboard = {
    merchant,
    credit: 0,
    balance: 0,
    platform_credit: 0,
    active_tasks: 0,
    activeTasks: 0,
    active_competitions: 0,
    valid_submissions: 0,
    submissions: 0,
    total_spent: 0,
    spent: 0,
    tasks: [],
    personal_tasks: [],
    competitions: [],
    collabs: [],
    bounties: [],
    offers: [],
    notifications: [],
    activity: [],
    stats: { active_tasks: 0, valid_submissions: 0, total_spent: 0 },
  }

  const pathName = requestUrl.pathname
  if (pathName === '/api/module-agent-launch/agents' && req.method === 'GET') {
    const fallback = defaultUploadedAgents.map((agent) => ({ ...agent, repoUrl: '', eventName: 'Local Hackathon', status: 'demo' }))
    return json(res, await loadJsonFile(moduleAgentsFile, fallback))
  }
  if (pathName === '/api/module-agent-launch/agents' && req.method === 'POST') {
    try {
      const agent = makeModuleAgent(await readJsonBody(req))
      if (!agent.name || !agent.owner || !agent.description || !agent.chatUrl) {
        return json(res, { error: 'name, owner, description, and chatUrl are required' }, 400)
      }
      const agents = await loadJsonFile(moduleAgentsFile, [])
      const nextAgents = [agent, ...agents].slice(0, 200)
      await saveJsonFile(moduleAgentsFile, nextAgents)
      return json(res, agent, 201)
    } catch {
      return json(res, { error: 'Invalid JSON body' }, 400)
    }
  }
  if (pathName === '/api/module-avatar/profiles' && req.method === 'GET') return json(res, await loadJsonFile(avatarProfilesFile, []))
  if (pathName === '/api/module-avatar/profiles' && req.method === 'POST') {
    try {
      const profile = makeAvatarProfile(await readJsonBody(req))
      if (!profile.agentName || !profile.role || !profile.personality || !profile.visualStyle) {
        return json(res, { error: 'agentName, role, personality, and visualStyle are required' }, 400)
      }
      const profiles = await loadJsonFile(avatarProfilesFile, [])
      const nextProfiles = [profile, ...profiles].slice(0, 200)
      await saveJsonFile(avatarProfilesFile, nextProfiles)
      return json(res, profile, 201)
    } catch {
      return json(res, { error: 'Invalid JSON body' }, 400)
    }
  }
  if (pathName === '/api/module-social/conversations' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const agents = await loadJsonFile(moduleAgentsFile, [])
      const a = agents.find((agent) => agent.id === body.agentA)
      const b = agents.find((agent) => agent.id === body.agentB)
      const topic = text(body.topic, 500)
      if (!a || !b || !topic) return json(res, { error: 'agentA, agentB, and topic are required' }, 400)
      const item = {
        id: crypto.randomUUID(),
        agentA: a.id,
        agentB: b.id,
        topic,
        report: {
          match: `${a.name} x ${b.name}`,
          topic,
          summary: `${a.name} should lead context gathering. ${b.name} should challenge assumptions and produce a next-step checklist.`,
          suggested_next_steps: ['Open both agent chat URLs', 'Run a 5-minute scoped conversation', 'Save outputs into the project room'],
          open_urls: [a.chatUrl, b.chatUrl].filter(Boolean),
        },
        created_at: new Date().toISOString(),
      }
      const conversations = await loadJsonFile(socialConversationsFile, [])
      await saveJsonFile(socialConversationsFile, [item, ...conversations].slice(0, 200))
      return json(res, item, 201)
    } catch {
      return json(res, { error: 'Invalid JSON body' }, 400)
    }
  }
  if (pathName === '/api/uploaded-agents' && req.method === 'GET') return json(res, await loadUploadedAgents())
  if (pathName === '/api/uploaded-agents' && req.method === 'POST') {
    try {
      const agent = makeUploadedAgent(await readJsonBody(req))
      if (!agent.name || !agent.owner || !agent.description || !agent.chatUrl) {
        return json(res, { error: 'name, owner, description, and chatUrl are required' }, 400)
      }
      const agents = await loadUploadedAgents()
      const nextAgents = [agent, ...agents].slice(0, 200)
      await saveUploadedAgents(nextAgents)
      return json(res, agent, 201)
    } catch {
      return json(res, { error: 'Invalid JSON body' }, 400)
    }
  }
  if (pathName.includes('/auth/') || pathName.endsWith('/me') || pathName.includes('/profile')) return json(res, merchant)
  if (pathName.includes('/showcase/')) return json(res, {
    title: 'Local demo',
    featured: false,
    hero: [
      { label: 'Active', value: 0 },
      { label: 'Submissions', value: 0 },
      { label: 'Spent', value: '—' },
    ],
    bars: [],
    items: [],
  })
  if (pathName.includes('/dashboard')) return json(res, dashboard)
  if (pathName.includes('/stats')) return json(res, { agents: 133931, earned: 44989, totalRewards: 0 })
  if (pathName.includes('/search')) return json(res, [])
  if (pathName.includes('/notifications')) return json(res, [])
  if (pathName.includes('/tasks') || pathName.includes('/quests') || pathName.includes('/offers') || pathName.includes('/bounties') || pathName.includes('/submissions') || pathName.includes('/engagements')) return json(res, [])
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') return json(res, { ok: true, id: 'local-demo', created_at: now })
  return json(res, {})
}

const exists = async (target) => {
  try {
    const stat = await fs.stat(target)
    return stat.isFile()
  } catch {
    return false
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://localhost:${port}`)
  if (await mockApi(req, res, requestUrl)) return
  const decodedPath = decodeURIComponent(requestUrl.pathname)

  if (decodedPath.startsWith('/module-parts/')) {
    const modulePartPath = decodedPath.replace(/^\/module-parts\/?/, '')
    const safeModulePartPath = path.normalize(modulePartPath).replace(/^\/+/, '')
    const target = path.join(modulePartsRoot, safeModulePartPath)
    if (!target.startsWith(modulePartsRoot) || !(await exists(target))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    const ext = path.extname(target)
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
    createReadStream(target).pipe(res)
    return
  }

  if (decodedPath === '/modules' || decodedPath.startsWith('/modules/')) {
    const modulePath = decodedPath.replace(/^\/modules\/?/, '')
    const safeModulePath = path.normalize(modulePath).replace(/^\/+/, '')
    let target = path.join(modulesRoot, safeModulePath || 'index.html')
    if (!(await exists(target))) {
      const htmlTarget = path.join(modulesRoot, `${safeModulePath}.html`)
      target = (await exists(htmlTarget)) ? htmlTarget : path.join(modulesRoot, 'index.html')
    }
    if (!target.startsWith(modulesRoot) || !(await exists(target))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    const ext = path.extname(target)
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
    createReadStream(target).pipe(res)
    return
  }

  const safePath = path.normalize(decodedPath).replace(/^\/+/, '')
  let target = path.join(root, safePath)

  if (decodedPath === '/' || decodedPath === '') {
    target = path.join(root, 'index.html')
  } else if (!(await exists(target))) {
    const htmlTarget = path.join(root, `${safePath}.html`)
    target = (await exists(htmlTarget)) ? htmlTarget : path.join(root, 'index.html')
  }

  if (!target.startsWith(root) || !(await exists(target))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  const ext = path.extname(target)
  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
  createReadStream(target).pipe(res)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Local mirror running at http://localhost:${port}`)
  console.log(`Serving: ${root}`)
})
