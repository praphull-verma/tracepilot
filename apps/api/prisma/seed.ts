import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger';

const prisma = new PrismaClient();

// ─── Seeded PRNG (Mulberry32) — reproducible demo data ──────────────────────
// Using a seeded PRNG instead of Math.random() so re-runs produce the same data
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function rnd(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ─── Data pools ─────────────────────────────────────────────────────────────

const firstNames = ['Aarav','Priya','Rohan','Ananya','Vikram','Kavya','Arjun','Meera','Raj','Sneha','Dev','Riya','Kiran','Aditi','Siddharth','Pooja','Aakash','Neha','Nikhil','Divya','Varun','Sonal','Amit','Kriti','Rahul','Ishita','Yash','Nandini','Kunal','Tanvi'];
const lastNames = ['Mehta','Sharma','Patel','Kumar','Singh','Joshi','Gupta','Agarwal','Verma','Shah','Kapoor','Nair','Reddy','Iyer','Pillai','Chowdhury','Bose','Ghosh','Das','Mishra'];
const companies = ['NovaTech Systems','Apex Digital','CloudBridge Inc.','PrimeSoft Ltd.','TechCore Solutions','DataVault Corp','InnovateTech','Quantum Analytics','SkyNet Solutions','FuturePath Inc.','GlobalTech Corp','Meridian Analytics','Fusion Systems','Pivot Technologies','NextLevel AI','SmartSync Ltd.','EdgeCloud Inc.','DeepData Corp','TransformX','ScaleUp Systems','BlueMountain Software','RealEdge Analytics','Catalyst Tech','Nexus Digital','ProActive Solutions','ByteStream Corp','InfoPulse Ltd.','SolidBridge Inc.','VaultTech','StreamLine Systems'];
const industries = ['SaaS','FinTech','HealthTech','RetailTech','EdTech','Manufacturing','Logistics','Real Estate','E-Commerce','Consulting'];
const sources = ['Website','LinkedIn','Referral','Cold Email','Webinar','Trade Show','Demo Request','Inbound Call','Partner','Event'];
const jobTitles = ['CTO','CEO','VP Sales','VP Engineering','Head of Operations','Director of IT','Product Manager','Engineering Manager','CMO','COO'];
const locations = ['Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Pune','Kolkata','Ahmedabad','Surat','Jaipur'];
const stages = ['PROSPECTING','QUALIFICATION','PROPOSAL','NEGOTIATION','CLOSED_WON','CLOSED_LOST'];
const interactionTypes = ['EMAIL','CALL','MEETING','DEMO','LINKEDIN','EVENT'];
const sentiments = ['POSITIVE','NEUTRAL','NEGATIVE'];
const statuses = ['ACTIVE','QUALIFIED','NEW','CONTACTED','CONVERTED','INACTIVE'];

// ─── Note templates ──────────────────────────────────────────────────────────

const buyingSignalNotes = [
  'Prospect attended product demo and expressed strong interest in enterprise tier. Asked detailed questions about API integration and custom reporting. Mentioned current vendor is causing reporting delays. Requested pricing comparison before Q4 budget finalization.',
  'Had a productive 45-minute call. Customer confirmed budget is approved for Q3. Very interested in the analytics module. Wants to move to evaluation phase. Requested technical documentation.',
  'Lead asked for a customized pricing proposal. Mentioned they are evaluating 2 other vendors. Decision timeline is end of month. CTO will be the final decision-maker.',
  'Positive demo follow-up. Customer confirmed our solution addresses their pain points. Mentioned they could consolidate 3 tools into our platform. Requested trial access.',
  'Attended our webinar and asked about enterprise pricing. Followed up via email requesting a demo slot. Company is in growth phase and expanding their tech stack.',
];

const negativeSignalNotes = [
  'Customer mentioned they are not planning to purchase this quarter due to budget freeze. Will revisit in Q1 next year. Keep in nurture track.',
  'Deal is currently paused due to procurement concerns and internal restructuring. Contact in 60 days.',
  'Customer went with a competitor. Cited lower pricing as the primary reason. Close the deal and add to lost analysis.',
  'Deal on hold. Decision-maker changed roles. New contact not yet identified. Follow up in 30 days.',
  'Customer expressed concerns about implementation complexity. May not have the internal resources. Needs more evaluation time.',
];

const neutralNotes = [
  'Initial discovery call completed. Identified pain points around data silos and manual reporting. Scheduled follow-up for next week.',
  'Sent pricing proposal. Awaiting feedback. Customer mentioned they need to review with finance team.',
  'Attended trade show. Collected business card. Prospect showed interest in our analytics platform. Will follow up with personalized email.',
  'Customer requested additional case studies from similar companies in their vertical. Sending over this week.',
  'Follow-up call to discuss integration requirements. Customer has existing CRM setup. Will need custom connectors.',
  'Reviewed our competitors comparison document. Customer appreciated the transparency. Will share with their team.',
  'Good rapport established. Key stakeholder is VP of Engineering. Identified internal champion at their company.',
  'Product roadmap walkthrough completed. Customer excited about upcoming AI features. Asked about beta access.',
];

// ─── Seed ────────────────────────────────────────────────────────────────────

async function seedUsers() {
  await prisma.user.upsert({
    where: { email: 'admin@tracepilot.io' },
    update: {},
    create: { name: 'Admin User', email: 'admin@tracepilot.io', role: 'admin' },
  });
  await prisma.user.upsert({
    where: { email: 'sales@tracepilot.io' },
    update: {},
    create: { name: 'Sales Rep', email: 'sales@tracepilot.io', role: 'sales_rep' },
  });
}

async function seedLeads(count: number) {
  console.log(`Seeding ${count} leads...`);

  const demoLeads = [
    {
      externalId: 'L-10001',
      name: 'Vikram Mehta',
      company: 'NovaTech Systems',
      email: 'vikram@novatech.io',
      jobTitle: 'CTO',
      industry: 'SaaS',
      companySize: 250,
      source: 'Demo Request',
      leadScore: 92,
      status: 'ACTIVE',
      estimatedDealValue: 72000,
      lastContactedAt: daysAgo(18),
      lastActivityAt: daysAgo(2),
      conversionProbability: 0.82,
      location: 'Bangalore',
    },
    {
      externalId: 'L-10003',
      name: 'Priya Sharma',
      company: 'Apex Digital',
      email: 'priya@apexdigital.com',
      jobTitle: 'VP Engineering',
      industry: 'FinTech',
      companySize: 180,
      source: 'LinkedIn',
      leadScore: 87,
      status: 'ACTIVE',
      estimatedDealValue: 58000,
      lastContactedAt: daysAgo(14),
      lastActivityAt: daysAgo(1),
      conversionProbability: 0.75,
      location: 'Mumbai',
    },
    {
      externalId: 'L-10007',
      name: 'Arjun Patel',
      company: 'CloudBridge Inc.',
      email: 'arjun@cloudbridge.io',
      jobTitle: 'CEO',
      industry: 'HealthTech',
      companySize: 120,
      source: 'Referral',
      leadScore: 81,
      status: 'ACTIVE',
      estimatedDealValue: 55000,
      lastContactedAt: daysAgo(21),
      lastActivityAt: daysAgo(5),
      conversionProbability: 0.68,
      location: 'Hyderabad',
    },
    {
      externalId: 'L-10012',
      name: 'Ananya Kumar',
      company: 'PrimeSoft Ltd.',
      email: 'ananya@primesoft.com',
      jobTitle: 'Director of IT',
      industry: 'Manufacturing',
      companySize: 500,
      source: 'Website',
      leadScore: 84,
      status: 'QUALIFIED',
      estimatedDealValue: 45000,
      lastContactedAt: daysAgo(12),
      lastActivityAt: daysAgo(3),
      conversionProbability: 0.72,
      location: 'Pune',
    },
    {
      externalId: 'L-10015',
      name: 'Rohan Singh',
      company: 'TechCore Solutions',
      email: 'rohan@techcore.io',
      jobTitle: 'VP Sales',
      industry: 'E-Commerce',
      companySize: 300,
      source: 'Cold Email',
      leadScore: 78,
      status: 'ACTIVE',
      estimatedDealValue: 38000,
      lastContactedAt: daysAgo(7),
      lastActivityAt: daysAgo(7),
      conversionProbability: 0.58,
      location: 'Delhi',
    },
    {
      externalId: 'L-10020',
      name: 'Dev Joshi',
      company: 'DataVault Corp',
      email: 'dev@datavault.io',
      jobTitle: 'CTO',
      industry: 'FinTech',
      companySize: 400,
      source: 'Trade Show',
      leadScore: 85,
      status: 'ACTIVE',
      estimatedDealValue: 95000,
      lastContactedAt: daysAgo(75),
      lastActivityAt: daysAgo(70),
      conversionProbability: 0.45,
      location: 'Mumbai',
    },
    {
      externalId: 'L-10025',
      name: 'Meera Reddy',
      company: 'InnovateTech',
      email: 'meera@innovatetech.io',
      jobTitle: 'CEO',
      industry: 'EdTech',
      companySize: 80,
      source: 'Webinar',
      leadScore: 88,
      status: 'ACTIVE',
      estimatedDealValue: 65000,
      lastContactedAt: daysAgo(10),
      lastActivityAt: daysAgo(4),
      conversionProbability: 0.65,
      location: 'Bangalore',
    },
  ];

  for (const lead of demoLeads) {
    await prisma.lead.upsert({
      where: { externalId: lead.externalId },
      update: lead,
      create: lead,
    });
  }

  for (let i = 0; i < count - demoLeads.length; i++) {
    const externalId = `L-${10100 + i}`;
    const daysContactAgo = pick([2, 7, 14, 21, 30, 45, 60, 90, 120, null]) as number | null;
    try {
      await prisma.lead.upsert({
        where: { externalId },
        update: {},
        create: {
          externalId,
          name: `${pick(firstNames)} ${pick(lastNames)}`,
          company: `${pick(companies)} ${i % 10 === 0 ? 'Group' : ''}`.trim(),
          email: rand() > 0.1 ? `lead${i}@example.com` : null,
          phone: rand() > 0.2 ? `+91${rnd(7000000000, 9999999999)}` : null,
          jobTitle: pick(jobTitles),
          industry: pick(industries),
          companySize: rnd(10, 5000),
          source: pick(sources),
          leadScore: rnd(10, 98),
          status: pick(statuses),
          estimatedDealValue: rand() > 0.3 ? rnd(5000, 200000) : null,
          lastContactedAt: daysContactAgo ? daysAgo(daysContactAgo) : null,
          lastActivityAt: daysAgo(rnd(0, 60)),
          conversionProbability: rand() > 0.2 ? Math.round(rand() * 100) / 100 : null,
          location: pick(locations),
          assignedTo: pick(['sales@tracepilot.io', 'rep2@tracepilot.io', 'rep3@tracepilot.io']),
        },
      });
    } catch {
      // Skip duplicates silently
    }
  }
}

async function seedCustomers(count: number) {
  console.log(`Seeding ${count} customers...`);
  for (let i = 0; i < count; i++) {
    const externalId = `C-${1001 + i}`;
    try {
      await prisma.customer.upsert({
        where: { externalId },
        update: {},
        create: {
          externalId,
          company: `${pick(companies)} Customer ${i}`,
          industry: pick(industries),
          size: pick(['SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']),
          status: rand() > 0.1 ? 'ACTIVE' : 'INACTIVE',
          lifetimeValue: rnd(10000, 500000),
          lastInteractionAt: daysAgo(rnd(1, 120)),
        },
      });
    } catch {
      // Skip
    }
  }
}

async function seedDeals(count: number) {
  console.log(`Seeding ${count} deals...`);
  const leads = await prisma.lead.findMany({ take: 500, select: { id: true, externalId: true } });

  for (let i = 0; i < count; i++) {
    const lead = pick(leads);
    const externalId = `D-${1001 + i}`;
    try {
      await prisma.deal.upsert({
        where: { externalId },
        update: {},
        create: {
          externalId,
          leadId: lead.id,
          name: `Deal for ${pick(companies)}`,
          stage: pick(stages),
          value: rnd(5000, 200000),
          probability: Math.round(rand() * 100) / 100,
          expectedCloseDate: new Date(Date.now() + rnd(-30, 180) * 24 * 60 * 60 * 1000),
        },
      });
    } catch {
      // Skip
    }
  }

  const demoDeals = [
    { externalId: 'D-NOVA-001', leadExternalId: 'L-10001', name: 'NovaTech Enterprise Suite', stage: 'PROPOSAL', value: 72000, probability: 0.82 },
    { externalId: 'D-APEX-001', leadExternalId: 'L-10003', name: 'Apex Analytics Platform', stage: 'NEGOTIATION', value: 58000, probability: 0.75 },
    { externalId: 'D-CLOUD-001', leadExternalId: 'L-10007', name: 'CloudBridge Integration', stage: 'NEGOTIATION', value: 55000, probability: 0.68 },
    { externalId: 'D-DATA-001', leadExternalId: 'L-10020', name: 'DataVault Enterprise Deal', stage: 'QUALIFICATION', value: 95000, probability: 0.45 },
  ];

  for (const dd of demoDeals) {
    const lead = await prisma.lead.findUnique({ where: { externalId: dd.leadExternalId } });
    if (lead) {
      await prisma.deal.upsert({
        where: { externalId: dd.externalId },
        update: { stage: dd.stage, value: dd.value, probability: dd.probability },
        create: {
          externalId: dd.externalId,
          leadId: lead.id,
          name: dd.name,
          stage: dd.stage,
          value: dd.value,
          probability: dd.probability,
          expectedCloseDate: daysAgo(-30),
        },
      });
    }
  }
}

async function seedInteractions(count: number) {
  console.log(`Seeding ${count} interactions...`);
  const leads = await prisma.lead.findMany({ take: 200, select: { id: true } });

  for (let i = 0; i < count; i++) {
    const lead = pick(leads);
    await prisma.interaction.create({
      data: {
        leadId: lead.id,
        type: pick(interactionTypes),
        direction: pick(['INBOUND', 'OUTBOUND']),
        subject: `${pick(['Follow-up', 'Demo', 'Proposal', 'Check-in', 'Objection handling'])} - ${pick(companies)}`,
        summary: pick([
          'Positive conversation, moving forward',
          'Customer requested more information',
          'Scheduled follow-up meeting',
          'Technical questions answered',
          'Price negotiation in progress',
          'Customer evaluating options',
        ]),
        timestamp: daysAgo(rnd(0, 90)),
        sentiment: pick(sentiments),
        outcome: pick(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'FOLLOW_UP']),
      },
    });
  }

  const novaLead = await prisma.lead.findUnique({ where: { externalId: 'L-10001' } });
  if (novaLead) {
    await prisma.interaction.createMany({
      data: [
        { leadId: novaLead.id, type: 'DEMO', direction: 'OUTBOUND', subject: 'Product Demo - NovaTech', summary: 'Excellent demo session, CTO asked detailed API questions', timestamp: daysAgo(20), sentiment: 'POSITIVE', outcome: 'POSITIVE' },
        { leadId: novaLead.id, type: 'EMAIL', direction: 'INBOUND', subject: 'RE: Pricing Proposal', summary: 'Requested customized pricing and integration docs', timestamp: daysAgo(2), sentiment: 'POSITIVE', outcome: 'FOLLOW_UP' },
      ],
    });
  }
}

async function seedBusinessNotes() {
  console.log('Seeding business notes...');

  const demoNotes = [
    {
      leadExternalId: 'L-10001',
      notes: [
        { title: 'Post-Demo Follow-up', content: buyingSignalNotes[0]!, source: 'CRM' },
        { title: 'API Integration Interest', content: 'Prospect requested API integration pricing comparison. Specifically interested in webhooks and REST API access. Mentioned their engineering team is ready to integrate within 2 weeks of signing.', source: 'EMAIL' },
      ],
    },
    {
      leadExternalId: 'L-10003',
      notes: [
        { title: 'Budget Confirmed', content: buyingSignalNotes[1]!, source: 'CALL' },
        { title: 'Competitor Evaluation', content: 'Currently evaluating 2 other vendors. Our differentiation on analytics depth is resonating. Decision expected by end of month.', source: 'CRM' },
      ],
    },
    {
      leadExternalId: 'L-10007',
      notes: [
        { title: 'Deal Status Update', content: negativeSignalNotes[1]!, source: 'CRM' },
        { title: 'Procurement Review', content: 'Deal paused due to procurement concerns and internal restructuring. The contact mentioned they are going through a leadership change. Recommend checking back in 4-6 weeks.', source: 'CRM' },
      ],
    },
    {
      leadExternalId: 'L-10020',
      notes: [
        { title: 'Trade Show Contact', content: 'Met at Mumbai TechSummit. Showed strong interest in our enterprise analytics. High deal value potential ($90k+). Has not followed up despite multiple attempts. Data may be stale.', source: 'EVENT' },
      ],
    },
    {
      leadExternalId: 'L-10025',
      notes: [
        { title: 'Budget Freeze', content: negativeSignalNotes[0]!, source: 'CRM' },
        { title: 'Webinar Attendee', content: 'Attended our AI in Sales webinar. Very engaged, asked many questions. However, subsequently mentioned budget freeze until next year.', source: 'WEBINAR' },
      ],
    },
  ];

  // Index containing { leadId } in metadata so per-lead retrieval works without joins
  const { indexDocument } = await import('../src/services/retrieval');

  for (const dn of demoNotes) {
    const lead = await prisma.lead.findUnique({ where: { externalId: dn.leadExternalId } });
    if (lead) {
      for (const note of dn.notes) {
        const created = await prisma.businessNote.upsert({
          where: { id: `demo-${dn.leadExternalId}-${note.title.replace(/\s/g, '-')}` },
          update: { content: note.content },
          create: {
            id: `demo-${dn.leadExternalId}-${note.title.replace(/\s/g, '-')}`,
            entityType: 'Lead',
            // entityId is the lead's internal id so retrieval.sourceId === lead.id
            entityId: lead.id,
            leadId: lead.id,
            title: note.title,
            content: note.content,
            author: 'Sales Rep',
            source: note.source,
          },
        });

        try {
          await indexDocument('BusinessNote', created.id, `${note.title}\n${note.content}`, {
            entityType: 'Lead',
            // Store lead.id (internal) so searchNotes(filters.entityId=lead.id) matches
            entityId: lead.id,
            leadId: lead.id,
            externalId: dn.leadExternalId,
          });
        } catch (err) {
          logger.warn('Failed to embed demo note, saved without vector', {
            note: note.title,
            error: (err as Error).message,
          });
        }
      }
    }
  }

  // Random notes for other leads — save first, then embed all in a batch for speed
  const leads = await prisma.lead.findMany({ take: 300, select: { id: true } });
  const allNoteTemplates = [...buyingSignalNotes, ...negativeSignalNotes, ...neutralNotes];
  const createdNotes: { id: string; title: string; content: string; leadId: string }[] = [];

  for (let i = 0; i < 500; i++) {
    const lead = pick(leads);
    const content = pick(allNoteTemplates);
    try {
      const created = await prisma.businessNote.create({
        data: {
          entityType: 'Lead',
          entityId: lead.id,
          leadId: lead.id,
          title: `Note ${i + 1}`,
          content,
          author: pick(['Sales Rep', 'Account Manager', 'BDR', 'SDR']),
          source: pick(['CRM', 'EMAIL', 'CALL', 'MEETING']),
        },
      });
      createdNotes.push({ id: created.id, title: `Note ${i + 1}`, content, leadId: lead.id });
    } catch {
      // Skip
    }
  }

  // Batch-embed all created notes with progress logging
  console.log(`Embedding ${createdNotes.length} notes in batches...`);
  const BATCH = 25;
  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < createdNotes.length; i += BATCH) {
    const batch = createdNotes.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (n) => {
        try {
          await indexDocument('BusinessNote', n.id, `${n.title}\n${n.content}`, {
            entityType: 'Lead',
            entityId: n.leadId,
            leadId: n.leadId,
          });
          embedded++;
        } catch (err) {
          logger.warn('Failed to embed note', { id: n.id, error: (err as Error).message });
          failed++;
        }
      })
    );
    console.log(`  Embedded ${Math.min(i + BATCH, createdNotes.length)} / ${createdNotes.length} notes...`);
    // Small delay between batches to stay within rate limits
    if (i + BATCH < createdNotes.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log(`  Embedding complete: ${embedded} ok, ${failed} failed (saved without vector)`);
}

async function seedEvaluationCases() {
  console.log('Seeding evaluation cases...');
  const cases = [
    { id: 'EC-001', question: 'Which lead has the highest lead score?', expectedRoute: 'SQL', expectedIntent: 'STATISTICS_QUERY', category: 'SQL_SIMPLE' },
    { id: 'EC-002', question: 'Which 5 leads should our sales team contact today?', expectedRoute: 'HYBRID', expectedIntent: 'LEAD_PRIORITIZATION', category: 'HYBRID_RANKING' },
    { id: 'EC-003', question: 'What objections are customers mentioning most frequently?', expectedRoute: 'RAG', expectedIntent: 'NOTE_ANALYSIS', category: 'RAG_SIMPLE' },
    { id: 'EC-004', question: 'How many leads are in ACTIVE status?', expectedRoute: 'SQL', expectedIntent: 'STATISTICS_QUERY', category: 'SQL_SIMPLE' },
    { id: 'EC-005', question: 'Which high-value deals are at risk?', expectedRoute: 'HYBRID', expectedIntent: 'DEAL_ANALYSIS', category: 'HYBRID_RISK' },
    { id: 'EC-006', question: 'Which customers show declining engagement?', expectedRoute: 'HYBRID', expectedIntent: 'CUSTOMER_RISK', category: 'CUSTOMER_RISK' },
    { id: 'EC-007', question: 'Show leads with high engagement but no contact in the last 14 days.', expectedRoute: 'HYBRID', expectedIntent: 'LEAD_PRIORITIZATION', category: 'HYBRID_FILTER' },
    { id: 'EC-008', question: 'What is the total pipeline value?', expectedRoute: 'SQL', expectedIntent: 'STATISTICS_QUERY', category: 'SQL_AGGREGATE' },
    { id: 'EC-009', question: 'Which leads have strong buying signals in their notes?', expectedRoute: 'HYBRID', expectedIntent: 'LEAD_PRIORITIZATION', category: 'HYBRID_RAG' },
    { id: 'EC-010', question: 'Which opportunities should be reviewed by a manager?', expectedRoute: 'HYBRID', expectedIntent: 'DEAL_ANALYSIS', category: 'HYBRID_RISK' },
  ];

  for (const c of cases) {
    await prisma.evaluationCase.upsert({
      where: { id: c.id },
      update: { expectedRoute: c.expectedRoute },
      create: {
        id: c.id,
        question: c.question,
        expectedRoute: c.expectedRoute,
        expectedDecision: c.expectedIntent,
        expectedEntities: [],
        category: c.category,
        difficulty: 'MEDIUM',
      },
    });
  }
}

async function seedDataSources() {
  await prisma.dataSource.upsert({
    where: { id: 'ds-demo-leads' },
    update: {},
    create: {
      id: 'ds-demo-leads',
      name: 'Demo Leads Dataset',
      type: 'leads',
      fileName: 'leads_2026.csv',
      rowCount: 200,
      qualityScore: 92,
      duplicates: 3,
      missingValues: 12,
      staleness: 0.08,
      indexed: true,
      status: 'ACTIVE',
      schema: ['id', 'name', 'company', 'email', 'lead_score', 'status', 'deal_value'] as never,
    },
  });

  await prisma.dataSource.upsert({
    where: { id: 'ds-demo-notes' },
    update: {},
    create: {
      id: 'ds-demo-notes',
      name: 'CRM Notes Export',
      type: 'notes',
      fileName: 'crm_notes_q3.csv',
      rowCount: 500,
      qualityScore: 88,
      duplicates: 5,
      missingValues: 20,
      staleness: 0.12,
      indexed: true,
      status: 'ACTIVE',
      schema: ['entity_id', 'title', 'content', 'author', 'created_at'] as never,
    },
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting TracePilot seed...\n');

  try {
    await seedUsers();
    console.log('✅ Users seeded');

    await seedLeads(200);
    console.log('✅ Leads seeded');

    await seedCustomers(50);
    console.log('✅ Customers seeded');

    await seedDeals(200);
    console.log('✅ Deals seeded');

    await seedInteractions(500);
    console.log('✅ Interactions seeded');

    await seedBusinessNotes();
    console.log('✅ Business notes seeded (with embeddings)');

    await seedEvaluationCases();
    console.log('✅ Evaluation cases seeded');

    await seedDataSources();
    console.log('✅ Data sources seeded');

    console.log('\n✨ TracePilot seed complete!');
    console.log('\n📊 Seeded:');
    const [leads, customers, deals, interactions, notes, embedDocs] = await Promise.all([
      prisma.lead.count(),
      prisma.customer.count(),
      prisma.deal.count(),
      prisma.interaction.count(),
      prisma.businessNote.count(),
      prisma.embeddingDocument.count(),
    ]);
    console.log(`  Leads: ${leads}`);
    console.log(`  Customers: ${customers}`);
    console.log(`  Deals: ${deals}`);
    console.log(`  Interactions: ${interactions}`);
    console.log(`  Business Notes: ${notes}`);
    console.log(`  Embedding Documents: ${embedDocs}`);
  } catch (err) {
    console.error('Seed failed:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
