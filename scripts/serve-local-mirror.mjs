import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', 'site')
const modulePartsRoot = path.resolve(__dirname, '..', 'modules')
const modulesRoot = path.resolve(__dirname, '..', 'modules', 'web')
const dataDir = path.resolve(__dirname, '..', 'data')
const vibeResearchRoot = '/gpfs/users/liujinxiu/research/viberesearch'
const globalEnvFile = '/gpfs/users/liujinxiu/.env'
const agentsFile = path.join(dataDir, 'uploaded-agents.json')
const moduleAgentsFile = path.join(dataDir, 'module-agent-launch-agents.json')
const moduleSkillDir = path.join(dataDir, 'agent-skills')
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

const readDotEnv = async (file) => {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return Object.fromEntries(raw.split(/\r?\n/).map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return null
      const index = trimmed.indexOf('=')
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
      return [key, value]
    }).filter(Boolean))
  } catch {
    return {}
  }
}

const buildAgentRuntimePrompt = (message, agent) => {
  if (!agent) return message
  const skill = text(agent?.skillPrompt || agent?.description, 12000)
  const description = text(agent?.description, 4000)
  const mcp = agent?.mcpConfig || null
  return [
    'You are running inside Another Me.',
    'Load the selected skill/persona behavior and expose it through the chat UI.',
    'Before every answer, read the saved PROFILE.md or skill text below, consolidate it into your working memory/persona, and answer as that Agent.',
    'Follow the saved PROFILE.md, the saved user-written description, and the uploaded skill package below. If they conflict, the saved PROFILE.md has the highest priority, then the saved user-written description, then the uploaded skill package.',
    'Do not mention implementation details unless the user asks.',
    '',
    '[AGENT_PROFILE]',
    `Name: ${agent?.name || '觅见AI'}`,
    `Owner: ${agent?.owner || 'Unknown'}`,
    `Category: ${agent?.category || 'General'}`,
    `Tagline: ${agent?.tagline || ''}`,
    '',
    '[USER_DESCRIPTION]',
    description || 'No written description was provided.',
    '[/USER_DESCRIPTION]',
    '',
    '[AGENT_SKILL]',
    skill || 'No explicit skill text was provided yet. Behave as a concise, helpful Another Me agent.',
    '[/AGENT_SKILL]',
    '',
    mcp ? '[MCP_CONFIG]' : '',
    mcp ? `Name: ${mcp.name || 'Unnamed MCP'}` : '',
    mcp ? `Endpoint: ${mcp.endpoint || 'Not provided'}` : '',
    mcp ? `Purpose: ${mcp.purpose || 'Not provided'}` : '',
    mcp ? '[/MCP_CONFIG]' : '',
    mcp ? '' : '',
    '[USER_MESSAGE]',
    message,
    '[/USER_MESSAGE]',
  ].join('\n')
}

const normalizeChatHistory = (history) => {
  if (!Array.isArray(history)) return []
  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-16)
    .map((item) => ({
      role: item.role,
      content: text(item.text || item.content, 4000),
    }))
    .filter((item) => item.content)
}

const runAnotherMeChat = async (message, agent = null, history = []) => {
  const envFromFile = await readDotEnv(globalEnvFile)
  const model = envFromFile.OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-5'
  const apiKey = envFromFile.OPENAI_API_KEY || envFromFile.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY
  const baseUrl = (envFromFile.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  if (!apiKey) throw new Error('缺少 OPENAI_API_KEY 或 LLM_API_KEY。')
  const runtimePrompt = buildAgentRuntimePrompt(message, agent)
  const scopedHistory = normalizeChatHistory(history)
  const priorMessages = scopedHistory.at(-1)?.role === 'user' && scopedHistory.at(-1)?.content === message
    ? scopedHistory.slice(0, -1)
    : scopedHistory
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are 觅见AI. Use only the current conversation history provided in this request. Do not infer or remember content from other chat windows. Reply concisely and do not mention implementation details.' },
        ...priorMessages,
        { role: 'user', content: runtimePrompt },
      ],
    }),
    signal: controller.signal,
  })
  clearTimeout(timeout)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || `模型接口返回 ${response.status}`
    throw new Error(sanitizeAssistantOutput(detail))
  }
  const output = data?.choices?.[0]?.message?.content
  return { output: sanitizeAssistantOutput(output || '') }
}

const sanitizeAssistantOutput = (value) => String(value || '')
  .replaceAll('EvoScientist', 'Another Me')
  .replaceAll('EvoSci', 'Another Me')
  .replaceAll('evosci', 'Another Me')
  .replaceAll('viberesearch', 'Another Me')
  .replaceAll(vibeResearchRoot, 'Another Me')

const extractAssistantReply = (raw) => {
  const normalized = sanitizeAssistantOutput(raw).replace(/\r/g, '')
  const lines = normalized.split('\n')
  const separatorIndexes = lines
    .map((line, index) => (/^[─━-]{20,}$/.test(line.trim()) ? index : -1))
    .filter((index) => index >= 0)
  let start = separatorIndexes.length >= 2 ? separatorIndexes[1] + 1 : 0
  while (start < lines.length && /^(Thread:|Workspace:|\s*$)/.test(lines[start])) start += 1
  const body = []
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\s*\[Usage:/.test(line)) break
    if (/^npm error\b/.test(line)) break
    if (/^╭─/.test(line)) break
    if (/^\[Error\]/.test(line)) break
    body.push(line)
  }
  const cleaned = body.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cleaned || normalized
}

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

const safeFileName = (value, fallback = 'skill.zip') => {
  const cleaned = path.basename(String(value || '')).replace(/[^a-zA-Z0-9._-]/g, '_')
  return cleaned || fallback
}

const execFileAsync = (command, args, options = {}) => new Promise((resolve, reject) => {
  execFile(command, args, options, (error, stdout, stderr) => {
    if (error) {
      error.message = `${error.message}\n${stderr || stdout || ''}`.trim()
      reject(error)
      return
    }
    resolve({ stdout, stderr })
  })
})

const walkFiles = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const files = []
  for (const entry of entries) {
    const target = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkFiles(target))
    } else if (entry.isFile()) {
      files.push(target)
    }
  }
  return files
}

const readExtractedSkillText = async (extractDir) => {
  const files = await walkFiles(extractDir)
  const allowed = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.py', '.js', '.ts', '.tsx', '.jsx'])
  const prioritized = [
    ...files.filter((file) => path.basename(file).toLowerCase() === 'skill.md'),
    ...files.filter((file) => path.basename(file).toLowerCase() !== 'skill.md' && allowed.has(path.extname(file).toLowerCase())),
  ]
  const chunks = []
  let used = 0
  for (const file of prioritized) {
    if (used >= 16000) break
    const stat = await fs.stat(file).catch(() => null)
    if (!stat || stat.size > 512 * 1024) continue
    const relative = path.relative(extractDir, file)
    const content = await fs.readFile(file, 'utf8').catch(() => '')
    if (!content.trim()) continue
    const slice = content.slice(0, Math.max(0, 16000 - used))
    chunks.push(`## ${relative}\n${slice}`)
    used += slice.length
  }
  return chunks.join('\n\n').trim()
}

const saveAndExtractSkillZip = async (agentId, body) => {
  const encoded = text(body.skillZipBase64, 50 * 1024 * 1024)
  if (!encoded) return null
  const skillRoot = path.join(moduleSkillDir, agentId)
  const zipPath = path.join(skillRoot, safeFileName(body.skillZipName))
  const extractDir = path.join(skillRoot, 'extracted')
  await fs.rm(skillRoot, { recursive: true, force: true })
  await fs.mkdir(extractDir, { recursive: true })
  await fs.writeFile(zipPath, Buffer.from(encoded, 'base64'))
  await execFileAsync('unzip', ['-qq', '-o', zipPath, '-d', extractDir])
  const extractedText = await readExtractedSkillText(extractDir)
  return {
    zipPath,
    extractDir,
    extractedText,
  }
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
  skillPrompt: text(body.skillPrompt, 24000),
  runtimeType: text(body.runtimeType, 80) || 'skill-runtime',
  status: text(body.status, 80) || 'submitted',
  mcpConfig: body.mcpConfig && typeof body.mcpConfig === 'object' ? {
    name: text(body.mcpConfig.name, 120),
    endpoint: text(body.mcpConfig.endpoint, 400),
    purpose: text(body.mcpConfig.purpose, 1200),
  } : null,
})

const makeAvatarProfile = (body) => {
  const agentName = text(body.agentName, 80)
  const role = text(body.role, 120)
  const personality = text(body.personality, 500)
  const visualStyle = text(body.visualStyle, 500)
  const color = text(body.color, 80)
  return {
    id: crypto.randomUUID(),
    agentName,
    role,
    personality,
    visualStyle,
    color,
    prompt: `Create a virtual avatar for ${agentName}: ${role}. Personality: ${personality}. Visual style: ${visualStyle}. Color direction: ${color}.`,
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
  if (pathName === '/api/module-agent-launch/chat' && req.method === 'POST') {
    const startedAt = Date.now()
    try {
      const body = await readJsonBody(req)
      const message = text(body.message, 8000)
      if (!message) return json(res, { error: 'message is required' }, 400)
      const agentId = text(body.agentId, 120)
      const agents = agentId ? await loadJsonFile(moduleAgentsFile, []) : []
      const agent = agentId ? agents.find((item) => item.id === agentId) : null
      if (agentId && !agent) return json(res, { error: 'agent not found' }, 404)
      console.log(`[agent-launch/chat] start agent=${agent?.name || '觅见AI'} agentId=${agentId || 'default'} history=${Array.isArray(body.history) ? body.history.length : 0}`)
      const result = await runAnotherMeChat(message, agent, body.history)
      console.log(`[agent-launch/chat] ok agent=${agent?.name || '觅见AI'} elapsed=${Date.now() - startedAt}ms`)
      return json(res, {
        output: result.output,
      })
    } catch (error) {
      console.error(`[agent-launch/chat] error elapsed=${Date.now() - startedAt}ms`, error)
      return json(res, {
        error: sanitizeAssistantOutput(error instanceof Error ? error.message : '聊天助手调用失败'),
      }, 500)
    }
  }
  if (pathName === '/api/module-agent-launch/agents' && req.method === 'GET') {
    const fallback = defaultUploadedAgents.map((agent) => ({ ...agent, repoUrl: '', eventName: 'Local Hackathon', status: 'demo' }))
    return json(res, await loadJsonFile(moduleAgentsFile, fallback))
  }
  if (pathName === '/api/module-agent-launch/agents' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const agent = makeModuleAgent(body)
      if (agent.status === 'published' && (!agent.owner || !agent.description)) {
        return json(res, { error: 'owner and description are required before publishing' }, 400)
      }
      if (!agent.name) agent.name = '觅见AI'
      if (!agent.owner) agent.owner = '未填写'
      if (!agent.description) agent.description = ''
      if (body.skillZipBase64) {
        const extracted = await saveAndExtractSkillZip(agent.id, body)
        agent.skillZipName = text(body.skillZipName, 240)
        agent.skillZipPath = extracted?.zipPath || ''
        agent.skillExtractDir = extracted?.extractDir || ''
        agent.skillExtracted = Boolean(extracted?.extractedText)
        agent.skillPrompt = [
          agent.skillPrompt,
          '',
          '# Extracted Skill Package',
          extracted?.extractedText || 'No readable text files were found in the uploaded skill package.',
        ].join('\n').trim()
      }
      const agents = await loadJsonFile(moduleAgentsFile, [])
      const nextAgents = [agent, ...agents].slice(0, 200)
      await saveJsonFile(moduleAgentsFile, nextAgents)
      return json(res, agent, 201)
    } catch {
      return json(res, { error: 'Invalid JSON body' }, 400)
    }
  }
  if (pathName.startsWith('/api/module-agent-launch/agents/') && req.method === 'PATCH') {
    try {
      const agentId = text(pathName.split('/').pop(), 120)
      const body = await readJsonBody(req)
      const agents = await loadJsonFile(moduleAgentsFile, [])
      const index = agents.findIndex((agent) => agent.id === agentId)
      if (index < 0) return json(res, { error: 'agent not found' }, 404)
      const previous = agents[index]
      const next = {
        ...previous,
        name: text(body.name, 80) || previous.name,
        owner: text(body.owner, 80) || previous.owner,
        tagline: text(body.tagline, 160),
        description: text(body.description, 1200) || previous.description,
        category: text(body.category, 80) || previous.category,
        skillPrompt: text(body.skillPrompt, 24000) || previous.skillPrompt,
        status: text(body.status, 80) || previous.status,
        mcpConfig: body.mcpConfig && typeof body.mcpConfig === 'object' ? {
          name: text(body.mcpConfig.name, 120),
          endpoint: text(body.mcpConfig.endpoint, 400),
          purpose: text(body.mcpConfig.purpose, 1200),
        } : previous.mcpConfig || null,
        updated_at: new Date().toISOString(),
      }
      if (body.skillZipBase64) {
        const extracted = await saveAndExtractSkillZip(next.id, body)
        next.skillZipName = text(body.skillZipName, 240)
        next.skillZipPath = extracted?.zipPath || ''
        next.skillExtractDir = extracted?.extractDir || ''
        next.skillExtracted = Boolean(extracted?.extractedText)
        next.skillPrompt = [
          next.skillPrompt,
          '',
          '# Extracted Skill Package',
          extracted?.extractedText || 'No readable text files were found in the uploaded skill package.',
        ].join('\n').trim()
      }
      agents[index] = next
      await saveJsonFile(moduleAgentsFile, agents)
      return json(res, next)
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

  if (decodedPath === '/modules/agent-launch') {
    const target = path.join(modulePartsRoot, '01-agent-launch', 'page.html')
    if (!(await exists(target))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    res.writeHead(200, { 'Content-Type': mime['.html'] })
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
