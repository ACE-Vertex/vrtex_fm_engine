import { DESIGN_MODEL_VERSION } from '../../types/design'

export const AI_DESIGN_SCHEMA_ID = 'https://vrtex.dev/schemas/ai-design-1.0.0.json'

const extensibleObject = {
  type: 'object',
  additionalProperties: true,
} as const

export const AI_DESIGN_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: AI_DESIGN_SCHEMA_ID,
  title: 'VRTEX FM Engine AI Design',
  description: 'AI response contract used before conversion to the internal Design Model.',
  type: 'object',
  additionalProperties: true,
  required: ['project'],
  properties: {
    modelVersion: { type: 'string', default: DESIGN_MODEL_VERSION },
    project: {
      type: 'object',
      additionalProperties: true,
      required: ['name'],
      properties: {
        projectId: { type: 'string' },
        id: { type: 'string' },
        name: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    tables: {
      type: 'array',
      items: {
        ...extensibleObject,
        required: ['id', 'name', 'fields'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              ...extensibleObject,
              required: ['id', 'name', 'type'],
              properties: {
                id: { type: 'string', minLength: 1 },
                name: { type: 'string', minLength: 1 },
                type: { type: 'string', minLength: 1 },
                comment: { type: 'string' },
                isPrimaryKey: { type: 'boolean' },
                isForeignKey: { type: 'boolean' },
                isRequired: { type: 'boolean' },
                autoEnter: extensibleObject,
                storage: extensibleObject,
                validation: extensibleObject,
                calculation: extensibleObject,
              },
            },
          },
        },
      },
    },
    occurrences: {
      type: 'array',
      items: {
        ...extensibleObject,
        required: ['id', 'name', 'baseTableId'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          baseTableId: { type: 'string', minLength: 1 },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number', minimum: 120 },
          height: { type: 'number', minimum: 110 },
          collapsed: { type: 'boolean' },
        },
      },
    },
    tableOccurrences: { $ref: '#/properties/occurrences' },
    relationships: {
      type: 'array',
      items: {
        ...extensibleObject,
        required: ['id', 'leftOccurrenceId', 'leftFieldId', 'operator', 'rightOccurrenceId', 'rightFieldId'],
        properties: {
          id: { type: 'string', minLength: 1 },
          leftOccurrenceId: { type: 'string', minLength: 1 },
          leftFieldId: { type: 'string', minLength: 1 },
          operator: { type: 'string', minLength: 1 },
          rightOccurrenceId: { type: 'string', minLength: 1 },
          rightFieldId: { type: 'string', minLength: 1 },
          allowCreateLeft: { type: 'boolean' },
          allowCreateRight: { type: 'boolean' },
          deleteRelatedLeft: { type: 'boolean' },
          deleteRelatedRight: { type: 'boolean' },
          sortRelatedLeft: { type: 'boolean' },
          sortRelatedRight: { type: 'boolean' },
        },
      },
    },
    valueLists: { type: 'array', items: extensibleObject },
    scripts: { type: 'array', items: extensibleObject },
    layouts: { type: 'array', items: extensibleObject },
    componentCards: { type: 'array', items: extensibleObject },
    canvasState: extensibleObject,
    aiDesignInfo: extensibleObject,
  },
} as const
