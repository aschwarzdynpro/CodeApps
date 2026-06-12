import type {
  PublisherInfo,
  SolutionComponentInfo,
  WorkingSolution,
} from '../types/solution'

/**
 * Seeded sample data for standalone development (`npm run dev` without a
 * Power Platform host). Mirrors a realistic dev environment mid-sprint:
 * a few feature / bug working solutions, one deployment solution and the
 * customer publisher next to the default one.
 */

export const mockPublishers: PublisherInfo[] = [
  {
    id: 'b1a6f3a2-0000-4000-9000-000000000001',
    uniqueName: 'dynpro',
    friendlyName: 'DynPro GmbH',
    prefix: 'dyn',
  },
  {
    id: 'b1a6f3a2-0000-4000-9000-000000000002',
    uniqueName: 'DefaultPublisherDev',
    friendlyName: 'Default Publisher',
    prefix: 'new',
  },
]

const daysAgo = (days: number, hours = 0): string =>
  new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString()

export const mockSolutions: WorkingSolution[] = [
  {
    id: 'a0000000-0000-4000-9000-000000000001',
    uniqueName: 'feature_4711',
    title: 'Customer onboarding wizard',
    description:
      'Guided multi-step onboarding for new customers: intake form, document checklist and approval handover.',
    kind: 'feature',
    devOpsId: '4711',
    version: '1.0.0.0',
    isManaged: false,
    createdOn: daysAgo(12),
    modifiedOn: daysAgo(0, 3),
    publisher: mockPublishers[0],
    recordId: 'ws-0001',
    owner: 'Marie Curie',
    ownerId: 'u-0001',
    deploymentStatus: 'None',
  },
  {
    id: 'a0000000-0000-4000-9000-000000000002',
    uniqueName: 'feature_4720',
    title: 'Service-level dashboards',
    description: 'Embedded dashboards with SLA timers on the case form.',
    kind: 'feature',
    devOpsId: '4720',
    version: '1.0.0.0',
    isManaged: false,
    createdOn: daysAgo(8),
    modifiedOn: daysAgo(1, 5),
    publisher: mockPublishers[0],
  },
  {
    id: 'a0000000-0000-4000-9000-000000000003',
    uniqueName: 'bug_4732',
    title: 'Fix duplicate detection on quote lines',
    description:
      'Duplicate rule fires twice when quote lines are created via the API. Adjust rule + plugin guard.',
    kind: 'bug',
    devOpsId: '4732',
    version: '1.0.0.0',
    isManaged: false,
    createdOn: daysAgo(3),
    modifiedOn: daysAgo(0, 26),
    publisher: mockPublishers[0],
    recordId: 'ws-0003',
    owner: 'Lise Meitner',
    ownerId: 'u-0003',
    deploymentStatus: 'None',
  },
  {
    id: 'a0000000-0000-4000-9000-000000000004',
    uniqueName: 'bug_4699',
    title: 'Wrong currency on opportunity rollup',
    description: 'Rollup field ignores exchange rate on closed opportunities.',
    kind: 'bug',
    devOpsId: '4699',
    version: '1.0.1.0',
    isManaged: false,
    createdOn: daysAgo(19),
    modifiedOn: daysAgo(6),
    publisher: mockPublishers[0],
  },
  {
    id: 'a0000000-0000-4000-9000-000000000005',
    uniqueName: 'deploy_sprint_12',
    title: 'Deployment Sprint 12',
    description:
      'Collects every working solution accepted for the Sprint 12 release train.',
    kind: 'deployment',
    devOpsId: null,
    version: '1.12.0.0',
    isManaged: false,
    createdOn: daysAgo(14),
    modifiedOn: daysAgo(2),
    publisher: mockPublishers[0],
    recordId: 'ws-0005',
    owner: 'Niels Bohr',
    ownerId: 'u-0005',
    deploymentStatus: 'To be deployed',
  },
  {
    id: 'a0000000-0000-4000-9000-000000000006',
    uniqueName: 'feature_4655',
    title: 'Partner portal access requests',
    description: 'Power Pages form + approval flow for partner access.',
    kind: 'feature',
    devOpsId: '4655',
    version: '1.1.0.0',
    isManaged: false,
    createdOn: daysAgo(27),
    modifiedOn: daysAgo(9),
    publisher: mockPublishers[1],
  },
]

const components = (
  solutionKey: string,
  rows: Array<[typeCode: number, typeName: string, displayName: string]>,
): SolutionComponentInfo[] =>
  rows.map(([typeCode, typeName, displayName], i) => ({
    id: `c-${solutionKey}-${i + 1}`,
    objectId: `0bjec7id-${solutionKey}-0000-4000-${String(i + 1).padStart(12, '0')}`,
    typeCode,
    typeName,
    displayName,
  }))

export const mockComponentsBySolutionId: Record<string, SolutionComponentInfo[]> = {
  // feature_4711 — onboarding wizard
  'a0000000-0000-4000-9000-000000000001': components('f4711', [
    [1, 'Table', 'dyn_onboardingcase'],
    [1, 'Table', 'dyn_onboardingtask'],
    [2, 'Column', 'dyn_onboardingcase.dyn_stage'],
    [60, 'Form', 'Onboarding Case – Main'],
    [26, 'View', 'Active Onboarding Cases'],
    [29, 'Process', 'Onboarding approval flow'],
    [61, 'Web Resource', 'dyn_/onboarding/wizard.js'],
    [80, 'Model-driven App', 'Onboarding Hub'],
  ]),
  // feature_4720 — SLA dashboards
  'a0000000-0000-4000-9000-000000000002': components('f4720', [
    [59, 'Chart', 'Cases by SLA status'],
    [60, 'Form', 'Case – Main (SLA header)'],
    [61, 'Web Resource', 'dyn_/sla/timer.js'],
    [26, 'View', 'Cases breaching today'],
  ]),
  // bug_4732 — duplicate detection
  'a0000000-0000-4000-9000-000000000003': components('b4732', [
    [44, 'Duplicate Rule', 'Quote line duplicate check'],
    [91, 'Plugin Assembly', 'DynPro.Sales.Plugins'],
    [92, 'SDK Message Step', 'PreCreate quotedetail guard'],
  ]),
  // bug_4699 — currency rollup
  'a0000000-0000-4000-9000-000000000004': components('b4699', [
    [2, 'Column', 'opportunity.dyn_weightedvalue'],
    [29, 'Process', 'Recalculate rollup on close'],
  ]),
  // deploy_sprint_12 — already contains an earlier merge
  'a0000000-0000-4000-9000-000000000005': components('d12', [
    [1, 'Table', 'dyn_onboardingcase'],
    [60, 'Form', 'Onboarding Case – Main'],
    [29, 'Process', 'Onboarding approval flow'],
  ]),
  // feature_4655 — partner portal
  'a0000000-0000-4000-9000-000000000006': components('f4655', [
    [1, 'Table', 'dyn_accessrequest'],
    [29, 'Process', 'Partner access approval'],
    [380, 'Environment Variable', 'dyn_PortalBaseUrl'],
  ]),
}

/**
 * The mock merge has to recognise "already in target" — give the deployment
 * solution the same objectIds as the matching feature components.
 */
{
  const f4711 = mockComponentsBySolutionId['a0000000-0000-4000-9000-000000000001']
  const f4720 = mockComponentsBySolutionId['a0000000-0000-4000-9000-000000000002']
  const d12 = mockComponentsBySolutionId['a0000000-0000-4000-9000-000000000005']
  d12[0].objectId = f4711[0].objectId // dyn_onboardingcase
  d12[1].objectId = f4711[3].objectId // main form
  d12[2].objectId = f4711[5].objectId // approval flow
  // Collision-radar demo: both features carry the approval flow.
  f4720.push({ ...f4711[5], id: 'c-f4720-5' })
}
