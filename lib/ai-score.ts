import Anthropic from '@anthropic-ai/sdk'

export interface ScoreResult {
  score: number
  label: 'Cold' | 'Warm' | 'Hot'
  summary: string
  recommendation: string
}

export async function scoreLead(lead: {
  name: string
  companyName?: string | null
  email?: string | null
  source?: string | null
  stage: string
  monthlyValue?: number | null
  notes?: string | null
  track?: string | null
  relationship: string
}): Promise<ScoreResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `You are a sales qualification expert for Clarity, a B2B agency CRM. Score this lead.

Lead data:
- Name: ${lead.name}
- Company: ${lead.companyName ?? 'Unknown'}
- Source: ${lead.source ?? 'Unknown'}
- Stage: ${lead.stage}
- Monthly Value: ${lead.monthlyValue != null ? `$${lead.monthlyValue}` : 'Not set'}
- Track: ${lead.track ?? 'Unknown'}
- Notes: ${lead.notes ?? 'None'}

Respond ONLY with valid JSON in exactly this format (no markdown, no extra text):
{
  "score": <integer 0-100>,
  "label": "<Cold|Warm|Hot>",
  "summary": "<2-3 sentences explaining the score>",
  "recommendation": "<1-2 sentences: specific next action>"
}

Scoring guide:
- Hot (80-100): Strong signals, budget confirmed or implied, decision-maker identified, clear pain
- Warm (50-79): Moderate signals, some unknowns, worth pursuing
- Cold (0-49): Weak signals, vague context, or very early stage`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const parsed = JSON.parse(text.trim()) as ScoreResult
  return parsed
}
