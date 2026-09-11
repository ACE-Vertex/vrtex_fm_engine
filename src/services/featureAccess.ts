import { reactive } from 'vue'

export type LicenseTier = 'free' | 'pro' | 'development'
export type LicenseStatus = 'active' | 'inactive' | 'expired'

export type FeatureId =
  | 'aiAssistant'
  | 'codeGeneration'
  | 'componentCards'
  | 'xmlValidation'
  | 'clipboardDelivery'
  | 'relationshipDesigner'
  | 'tableOccurrenceCanvas'
  | 'relationshipGraph'
  | 'autoArrange'
  | 'relationshipInspector'
  | 'projectSnapshot'
  | 'designTemplates'
  | 'layoutDesigner'
  | 'knowledgePackEngine'
  | 'knowledgePackBuilder'
  | 'fileMakerKnowledgeBase'
  | 'knowledgeLearning'
  | 'repairLearning'
  | 'knowledgeImportExport'

export interface LicenseState {
  tier: LicenseTier
  status: LicenseStatus
  expiresAt?: string
  grantedFeatures?: FeatureId[]
}

const FREE_FEATURES: readonly FeatureId[] = [
  'aiAssistant', 'codeGeneration', 'componentCards', 'xmlValidation', 'clipboardDelivery',
]

const PRO_FEATURES: readonly FeatureId[] = [
  ...FREE_FEATURES,
  'relationshipDesigner', 'tableOccurrenceCanvas', 'relationshipGraph', 'autoArrange',
  'relationshipInspector', 'projectSnapshot', 'designTemplates', 'layoutDesigner',
  'knowledgePackEngine', 'knowledgePackBuilder', 'fileMakerKnowledgeBase',
  'knowledgeLearning', 'repairLearning', 'knowledgeImportExport',
]

export class FeatureAccessService {
  private state: LicenseState

  constructor(initialState = defaultLicenseState()) {
    this.state = reactive(sanitizeLicenseState(initialState))
  }

  snapshot(): Readonly<LicenseState> {
    return { ...this.state, grantedFeatures: this.state.grantedFeatures ? [...this.state.grantedFeatures] : undefined }
  }

  can(feature: FeatureId): boolean {
    if (this.state.status !== 'active' || isExpired(this.state.expiresAt)) return false
    if (this.state.grantedFeatures?.includes(feature)) return true
    return (this.state.tier === 'pro' || this.state.tier === 'development' ? PRO_FEATURES : FREE_FEATURES).includes(feature)
  }

  require(feature: FeatureId): void {
    if (!this.can(feature)) throw new FeatureAccessError(feature, this.state.tier)
  }

  /** Only licenseGateway may call this with state returned by the verified native provider. */
  applyVerifiedLicense(license: LicenseState): void {
    const next = sanitizeLicenseState(license)
    this.state.tier = next.tier
    this.state.status = next.status
    this.state.expiresAt = next.expiresAt
    this.state.grantedFeatures = next.grantedFeatures
  }
}

export class FeatureAccessError extends Error {
  constructor(public readonly feature: FeatureId, public readonly tier: LicenseTier) {
    super(`Feature "${feature}" is not available for the ${tier} license`)
    this.name = 'FeatureAccessError'
  }
}

function defaultLicenseState(): LicenseState {
  const configuredTier = import.meta.env.VITE_VFE_LICENSE_TIER
  if (import.meta.env.DEV && (configuredTier === 'pro' || configuredTier === 'free' || configuredTier === 'development')) {
    return { tier: configuredTier, status: 'active' }
  }
  return { tier: import.meta.env.DEV ? 'development' : 'free', status: 'active' }
}

function sanitizeLicenseState(value: LicenseState): LicenseState {
  const tier = value.tier === 'pro' || value.tier === 'development' ? value.tier : 'free'
  const status = value.status === 'inactive' || value.status === 'expired' ? value.status : 'active'
  return {
    tier,
    status: isExpired(value.expiresAt) ? 'expired' : status,
    expiresAt: value.expiresAt,
    grantedFeatures: value.grantedFeatures?.filter((feature) => PRO_FEATURES.includes(feature)),
  }
}

function isExpired(value?: string) {
  return Boolean(value && !Number.isNaN(Date.parse(value)) && Date.parse(value) <= Date.now())
}

export const featureAccess = new FeatureAccessService()
