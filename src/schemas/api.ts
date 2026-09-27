import { z } from 'zod'
import type { AnalysisReport, AnalysisStartResponse, BaselineEvaluation, ModelEvaluation, QualityCheck, GroupOverlap, ValidationOption, ValidationSummary, AnalysisEvaluation, ActualVsPredicted } from '../types/analysis'
import type { ColumnDescriptor, DatasetSummaryData, ExplanationResponse, Language, PredictionInterval, PredictionResponse, Scalar, ValidationStrategy } from '../types/cropcast'

/**
 * Runtime schemas for everything the backend sends.
 *
 * Each schema is annotated with the hand-written type from `src/types`, so the two cannot drift:
 * if a field is added, renamed, or made nullable on one side only, `npm run typecheck` fails.
 * Until these existed, a malformed payload was cast with `as T` and surfaced as a blank panel.
 */

const scalarSchema: z.ZodType<Scalar> = z.union([z.string(), z.number(), z.boolean(), z.null()])

const qualityStatusSchema = z.enum(['good', 'warning', 'review'])

export const qualityCheckSchema: z.ZodType<QualityCheck> = z.object({
  label: z.string(),
  status: qualityStatusSchema,
  value: z.string(),
  detail: z.string(),
})

export const columnDescriptorSchema: z.ZodType<ColumnDescriptor> = z.object({
  id: z.string(),
  label: z.string(),
  dataType: z.enum(['number', 'integer', 'category', 'text', 'boolean', 'date', 'unknown']),
  nullable: z.boolean(),
  unit: z.string().optional(),
  unitInferred: z.boolean().optional(),
  allowedValues: z.array(scalarSchema).optional(),
  eligibleAsTarget: z.boolean(),
  eligibleAsFeature: z.boolean(),
})

export const datasetSummarySchema: z.ZodType<DatasetSummaryData> = z.object({
  datasetId: z.string().min(1),
  fileName: z.string(),
  rowCount: z.number().optional(),
  columnCount: z.number(),
  columns: z.array(columnDescriptorSchema),
})

export const predictionIntervalSchema: z.ZodType<PredictionInterval> = z.object({
  level: z.number().optional(),
  lower: z.number(),
  upper: z.number(),
  halfWidth: z.number().nullable(),
  inSample: z.boolean().optional(),
  method: z.string(),
})

export const predictionResponseSchema: z.ZodType<PredictionResponse> = z.object({
  predictionId: z.string().min(1),
  targetColumnId: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  unitInferred: z.boolean().optional(),
  model: z.enum(['ridge', 'lasso', 'elastic-net', 'random-forest']),
  interval: predictionIntervalSchema.optional(),
  notices: z.array(z.string()).optional(),
})

export const explanationResponseSchema: z.ZodType<ExplanationResponse> = z.object({
  predictionId: z.string(),
  language: z.enum(['en', 'hi', 'te']),
  text: z.string(),
})

const nullishNumber = z.number().nullable()

export const modelEvaluationSchema: z.ZodType<ModelEvaluation> = z.object({
  model: z.enum(['ridge', 'lasso', 'elastic-net', 'random-forest']),
  label: z.string(),
  r2: nullishNumber,
  mae: nullishNumber,
  rmse: nullishNumber,
  selected: z.boolean(),
  parameters: z.array(z.string()),
  crossValidation: z.string(),
  holdoutR2: nullishNumber,
  holdoutMae: nullishNumber,
  holdoutRmse: nullishNumber,
})

export const baselineEvaluationSchema: z.ZodType<BaselineEvaluation> = z.object({
  label: z.string(),
  strategy: z.string(),
  r2: nullishNumber,
  mae: nullishNumber,
  rmse: nullishNumber,
  crossValidation: z.string(),
  holdoutR2: nullishNumber,
  holdoutMae: nullishNumber,
  holdoutRmse: nullishNumber,
})

export const groupOverlapSchema: z.ZodType<GroupOverlap> = z.object({
  column: z.string(),
  sharedValues: z.number(),
  distinctValues: z.number(),
  testRowsAffected: z.number(),
})

export const validationStrategySchema: z.ZodType<ValidationStrategy> = z.enum(['random', 'grouped', 'temporal'])

export const validationOptionSchema: z.ZodType<ValidationOption> = z.object({
  key: validationStrategySchema,
  label: z.string(),
  available: z.boolean(),
  reason: z.string(),
  note: z.string(),
})

export const validationSummarySchema: z.ZodType<ValidationSummary> = z.object({
  strategy: validationStrategySchema,
  label: z.string(),
  temporalColumn: z.string().nullable(),
  groupOverlap: z.array(groupOverlapSchema),
  note: z.string(),
  options: z.array(validationOptionSchema).min(1),
})

export const analysisEvaluationSchema: z.ZodType<AnalysisEvaluation> = z.object({
  selectionRule: z.string(),
  holdoutSummary: z.string(),
  note: z.string(),
  baseline: baselineEvaluationSchema,
  beatsBaseline: z.boolean(),
  improvementOverBaseline: z.number().nullable(),
  minimumMargin: z.number(),
  validation: validationSummarySchema,
})

export const actualVsPredictedSchema: z.ZodType<ActualVsPredicted> = z.object({
  actual: nullishNumber,
  predicted: nullishNumber,
  residual: nullishNumber,
})

const languageSchema: z.ZodType<Language> = z.enum(['en', 'hi', 'te'])

export const analysisReportSchema: z.ZodType<AnalysisReport> = z.object({
  analysisId: z.string().min(1),
  source: z.enum(['uploaded', 'demo']),
  inputColumns: z.array(columnDescriptorSchema).optional(),
  dataset: z.object({
    fileName: z.string(),
    fileSize: z.number(),
    fileType: z.string(),
    detectedFiles: z.array(z.string()),
    rows: z.number(),
    columns: z.number(),
    numericFeatures: z.number(),
    categoricalFeatures: z.number(),
    target: z.string(),
  }),
  quality: z.array(qualityCheckSchema),
  profile: z.object({
    targetSummary: z.array(z.object({ label: z.string(), value: z.number() })),
    correlations: z.array(z.object({ feature: z.string(), value: z.number().nullable() })),
    numericSummary: z.array(
      z.object({
        feature: z.string(),
        mean: nullishNumber,
        median: nullishNumber,
        min: nullishNumber,
        max: nullishNumber,
        standardDeviation: nullishNumber,
      }),
    ),
    categoricalSummary: z.array(
      z.object({
        feature: z.string(),
        uniqueValues: z.number(),
        topCategories: z.array(z.object({ label: z.string(), count: z.number() })),
      }),
    ),
  }),
  preprocessing: z.array(z.object({ label: z.string(), detail: z.string() })),
  evaluation: analysisEvaluationSchema,
  models: z.array(modelEvaluationSchema),
  prediction: z.object({
    label: z.string(),
    value: z.number(),
    unit: z.string().optional(),
    unitInferred: z.boolean().optional(),
    interval: predictionIntervalSchema.nullable(),
    evidenceShown: z.number(),
    evidenceTotal: z.number(),
    actualVsPredicted: z.array(actualVsPredictedSchema),
    residuals: z.array(z.number().nullable()),
  }),
  insights: z.array(z.object({ feature: z.string(), coefficient: z.number().nullable(), interpretation: z.string() })),
  insightsMethod: z.enum(['standardized-coefficients', 'permutation-importance']),
  insightsNote: z.string(),
  // The backend always sends all three locales, but the type allows any subset.
  explanations: z.object({ en: z.string(), hi: z.string(), te: z.string() }).partial(),
  caveats: z.array(z.string()),
})

export const targetSelectionSchema = z.object({
  status: z.literal('needs-target'),
  analysisId: z.string().min(1),
  fileName: z.string(),
  candidates: z.array(z.string()).min(1),
})

/** `/dataset/analyze` answers with either a finished report or a request to pick a target column. */
export const analysisStartResponseSchema: z.ZodType<AnalysisStartResponse> = z.union([targetSelectionSchema, analysisReportSchema])

export { languageSchema }
