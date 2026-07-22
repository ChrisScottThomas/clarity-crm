// clarity.config.ts — the single deploy-time configuration for a Clarity fork.
//
// This is the ONE file a forking team edits to rebrand and re-vocabularize the
// CRM. Change the values, redeploy, done — no code changes, no data migration.
//
// Everything is `as const` so the literal string unions survive at compile time:
// `lib/constants.ts` derives `Stage`, `Owner`, `Constraint`, etc. from here, and
// `lib/config-validation.ts` fails the boot loudly if a fork leaves it malformed.
//
// NOT here (deliberately): the relationship vocabulary. `client` is load-bearing
// — the "client is never auto-set" guardrail and the call→client conversion rate
// both key off it — so it stays fixed in `lib/constants.ts`, not fork-editable.

export const clarityConfig = {
  // --- Branding -----------------------------------------------------------
  brand: {
    name: 'Clarity',
    // Path under `public/` — swap the asset and this string to rebrand.
    logo: '/logo.svg',
    colors: { midnight: '#020f31', text: '#ffffff', blue: '#429edb' },
  },

  // --- Pipeline -----------------------------------------------------------
  // Stages in order. The first is the implicit stage for a brand-new lead.
  stages: [
    'New Lead', 'Contacted', 'Replied', 'Call Booked', 'Call Done', 'Closed Won', 'Closed Lost',
  ],

  // --- Team & lead vocabulary --------------------------------------------
  owners: ['Alex', 'Jordan'],
  tracks: ['Strategic / Commercial', 'Operations / Teams'],
  sources: [
    'Warm DM', 'Referral', 'Content Inbound', 'FounderON', 'Cold Outreach',
    'LinkedIn', 'Inbound', 'Event', 'Networking', 'cal.com',
  ],
  nextActions: [
    'Research contact', 'Send message', 'Follow up', 'Book call', 'Prepare call',
    'Send recap', 'Send proposal', 'Awaiting reply', 'Nurture', 'No action',
  ],

  // --- Business-diagnostic framework -------------------------------------
  // A proprietary advisory framework (constraints / debts / scaling roadmap).
  // When `diagnosticsEnabled` is false, these fields disappear from the lead
  // form and card and the analytics constraint breakdown is dropped — the DB
  // columns stay (nullable) but nothing reads or writes them.
  diagnosticsEnabled: true,
  constraints: ['Money', 'Market', 'Model', 'Manpower', 'Metrics', 'More'],
  constraintColors: {
    More: '#56d4e8', Money: '#ffde59', Metrics: '#a78bfa',
    Manpower: '#ff3131', Market: '#dc8c32', Model: '#e850a0',
  },
  businessDebts: ['Ignorance debt', 'Avoidance debt', 'Experience debt'],
  debtColors: { 'Ignorance debt': '#5271ff', 'Avoidance debt': '#34d399' },
  roadmapStages: [
    '0 (Improvise)', '1 (Monetize)', '2 (Advertise)', '3 (Stabilize)', '4 (Prioritize)',
    '5 (Productize)', '6 (Optimize)', '7 (Scale)', '8 (Scale)', '9 (Scale)',
  ],
} as const
