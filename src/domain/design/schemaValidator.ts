import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import { AI_DESIGN_JSON_SCHEMA } from './aiDesignSchema'
import type { DesignValidationIssue } from '../../types/design'

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false })
const validate = ajv.compile(AI_DESIGN_JSON_SCHEMA)

export function validateAiDesignSchema(value: unknown): DesignValidationIssue[] {
  if (validate(value)) return []
  return (validate.errors ?? []).map(schemaIssue)
}

function schemaIssue(error: ErrorObject): DesignValidationIssue {
  const parameter = 'missingProperty' in error.params
    ? `/${String(error.params.missingProperty)}`
    : ''
  return {
    severity: 'error',
    code: `AI_SCHEMA_${error.keyword.toLocaleUpperCase()}`,
    message: `AI Design schema violation: ${error.message ?? error.keyword}`,
    path: `${error.instancePath || '$'}${parameter}`,
  }
}
