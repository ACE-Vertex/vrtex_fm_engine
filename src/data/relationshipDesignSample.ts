export const relationshipDesignSample = {
  modelVersion: '1.0.0',
  project: {
    projectId: 'project_medical',
    name: '診療管理システム',
    description: '競走馬の診療記録、明細、病名、担当獣医師を管理するAI設計サンプル',
  },
  tables: [
    {
      id: 'table_horse', name: '馬マスター', description: '競走馬の基本情報',
      fields: [
        { id: 'field_horse_id', name: '馬ID', type: 'text', isPrimaryKey: true, isRequired: true, autoEnter: { calculation: 'Get ( UUID )' } },
        { id: 'field_horse_name', name: '馬名', type: 'text', isRequired: true },
        { id: 'field_birth_date', name: '生年月日', type: 'date' },
        { id: 'field_owner', name: '馬主', type: 'text' },
      ],
    },
    {
      id: 'table_visit', name: '診療カルテ', description: '診療単位のヘッダー情報',
      fields: [
        { id: 'field_visit_id', name: '診療ID', type: 'text', isPrimaryKey: true, isRequired: true },
        { id: 'field_visit_horse_id', name: '馬ID', type: 'text', isForeignKey: true, isRequired: true },
        { id: 'field_visit_vet_id', name: '獣医師ID', type: 'text', isForeignKey: true },
        { id: 'field_visit_date', name: '診療日', type: 'date', isRequired: true },
        { id: 'field_visit_summary', name: '所見', type: 'text' },
        { id: 'field_visit_number', name: '受付番号', type: 'text', validation: { unique: true } },
        { id: 'field_visit_status', name: '診療ステータス', type: 'text' },
        { id: 'field_visit_created_at', name: '作成日時', type: 'timestamp', autoEnter: { creationTimestamp: true } },
        { id: 'field_visit_updated_at', name: '更新日時', type: 'timestamp', autoEnter: { modificationTimestamp: true } },
        { id: 'field_visit_created_by', name: '作成者', type: 'text', autoEnter: { creationAccountName: true } },
      ],
    },
    {
      id: 'table_detail', name: '診療明細', description: '処置・投薬明細',
      fields: [
        { id: 'field_detail_id', name: '明細ID', type: 'text', isPrimaryKey: true, isRequired: true },
        { id: 'field_detail_visit_id', name: '診療ID', type: 'text', isForeignKey: true, isRequired: true },
        { id: 'field_detail_disease_id', name: '病名ID', type: 'text', isForeignKey: true },
        { id: 'field_detail_treatment', name: '処置内容', type: 'text' },
        { id: 'field_detail_amount', name: '金額', type: 'number' },
      ],
    },
    {
      id: 'table_vet', name: '担当獣医師', description: '獣医師マスター',
      fields: [
        { id: 'field_vet_id', name: '獣医師ID', type: 'text', isPrimaryKey: true, isRequired: true },
        { id: 'field_vet_name', name: '氏名', type: 'text', isRequired: true },
        { id: 'field_vet_license', name: '免許番号', type: 'text', validation: { unique: true } },
      ],
    },
    {
      id: 'table_disease', name: '病名マスター', description: '診断名と分類',
      fields: [
        { id: 'field_disease_id', name: '病名ID', type: 'text', isPrimaryKey: true, isRequired: true },
        { id: 'field_disease_name', name: '病名', type: 'text', isRequired: true },
        { id: 'field_disease_category', name: '分類', type: 'text' },
      ],
    },
  ],
  occurrences: [
    { id: 'to_horse', name: '馬マスター', baseTableId: 'table_horse', x: 100, y: 290, width: 240 },
    { id: 'to_visit', name: '診療カルテ', baseTableId: 'table_visit', x: 470, y: 250, width: 250 },
    { id: 'to_detail', name: '診療明細', baseTableId: 'table_detail', x: 850, y: 80, width: 245 },
    { id: 'to_vet', name: '担当獣医師', baseTableId: 'table_vet', x: 850, y: 370, width: 240 },
    { id: 'to_disease', name: '病名マスター', baseTableId: 'table_disease', x: 850, y: 630, width: 240 },
  ],
  relationships: [
    { id: 'rel_horse_visit', leftOccurrenceId: 'to_horse', leftFieldId: 'field_horse_id', operator: '=', rightOccurrenceId: 'to_visit', rightFieldId: 'field_visit_horse_id', allowCreateRight: true },
    { id: 'rel_visit_detail', leftOccurrenceId: 'to_visit', leftFieldId: 'field_visit_id', operator: '=', rightOccurrenceId: 'to_detail', rightFieldId: 'field_detail_visit_id', allowCreateRight: true },
    { id: 'rel_vet_visit', leftOccurrenceId: 'to_vet', leftFieldId: 'field_vet_id', operator: '=', rightOccurrenceId: 'to_visit', rightFieldId: 'field_visit_vet_id' },
    { id: 'rel_disease_detail', leftOccurrenceId: 'to_disease', leftFieldId: 'field_disease_id', operator: '=', rightOccurrenceId: 'to_detail', rightFieldId: 'field_detail_disease_id' },
  ],
  valueLists: [],
  scripts: [],
  layouts: [],
  componentCards: [
    { id: 'card_horse', title: '馬マスター', kind: 'table', sourceIds: ['table_horse'], description: 'テーブルとフィールド', status: 'draft' },
    { id: 'card_visit', title: '診療カルテ', kind: 'table', sourceIds: ['table_visit'], description: 'テーブルとフィールド', status: 'draft' },
  ],
  canvasState: { zoom: 1, pan: { x: 0, y: 0 }, arrangement: 'anchorBuoy' },
} as const
