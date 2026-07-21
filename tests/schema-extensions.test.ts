import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('prisma schema', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8')

  it('has Meeting model', () => { expect(schema).toContain('model Meeting') })
  it('has TimeEntry model', () => { expect(schema).toContain('model TimeEntry') })
  it('has WorkflowRule model', () => { expect(schema).toContain('model WorkflowRule') })
  it('has Conversation model', () => { expect(schema).toContain('model Conversation') })
  it('Lead has aiScore field', () => { expect(schema).toContain('aiScore') })
  it('Lead has aiScoreLabel field', () => { expect(schema).toContain('aiScoreLabel') })
  it('Conversation has source field', () => { expect(schema).toContain('source') })
  it('Conversation has meetingId field', () => { expect(schema).toMatch(/meetingId\s+String\?/) })
  it('Conversation has unique externalId', () => { expect(schema).toMatch(/externalId\s+String\?\s+@unique/) })
  it('Meeting has conversations back-relation', () => { expect(schema).toMatch(/conversations\s+Conversation\[\]/) })
  it('has ExternalEvent model', () => { expect(schema).toContain('model ExternalEvent') })
  it('ExternalEvent has unique externalId', () => { expect(schema).toMatch(/externalId\s+String\s+@unique/) })
  it('Lead has externalEvents back-relation', () => { expect(schema).toMatch(/externalEvents\s+ExternalEvent\[\]/) })
})
