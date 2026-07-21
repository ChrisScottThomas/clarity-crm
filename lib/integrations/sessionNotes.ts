export interface SessionNote { attendeeEmail: string; date: Date; text: string }
export interface SessionNotesProvider { fetchFor(email: string): Promise<SessionNote[]> }
export class MockSessionNotesProvider implements SessionNotesProvider {
  async fetchFor(): Promise<SessionNote[]> { return [] }
}
export const sessionNotesProvider: SessionNotesProvider = new MockSessionNotesProvider()
