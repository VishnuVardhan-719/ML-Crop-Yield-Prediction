import type { AnalysisReport, AnalysisStage } from '../types/analysis'

export const analysisStages: AnalysisStage[] = [
  { id: 'upload', label: 'Dataset uploaded', status: 'pending' },
  { id: 'structure', label: 'Dataset structure detected', status: 'pending' },
  { id: 'quality', label: 'Data quality analyzed', status: 'pending' },
  { id: 'target', label: 'Prediction target identified', status: 'pending' },
  { id: 'preprocess', label: 'Preprocessing prepared', status: 'pending' },
  { id: 'ridge', label: 'Ridge trained and validated', status: 'pending' },
  { id: 'lasso', label: 'Lasso trained and validated', status: 'pending' },
  { id: 'elastic-net', label: 'Elastic Net trained and validated', status: 'pending' },
  { id: 'random-forest', label: 'Random Forest trained and validated', status: 'pending' },
  { id: 'compare', label: 'Model performance compared', status: 'pending' },
  { id: 'report', label: 'Analysis report prepared', status: 'pending' },
]

export const demoAnalysisReport: AnalysisReport = {
  analysisId: 'demo-analysis-001',
  source: 'demo',
  dataset: {
    fileName: 'cropcast_sample.csv',
    fileSize: 18342,
    fileType: 'CSV',
    detectedFiles: ['cropcast_sample.csv'],
    rows: 240,
    columns: 6,
    numericFeatures: 4,
    categoricalFeatures: 1,
    target: 'Observed yield',
  },
  quality: [
    { label: 'Missing values', status: 'warning', value: '6 cells', detail: 'Median imputation was fitted on training folds only.' },
    { label: 'Duplicate rows', status: 'good', value: '0 rows', detail: 'No exact duplicate records were detected.' },
    { label: 'Constant columns', status: 'good', value: '0 columns', detail: 'Every retained feature contains variation.' },
    { label: 'Outlier indicators', status: 'review', value: '4 rows', detail: 'Rows remain in the analysis and are flagged for review.' },
    { label: 'Leakage checks', status: 'good', value: 'Passed', detail: 'Identifiers and target-derived columns were excluded.' },
  ],
  profile: {
    targetSummary: [
      { label: '2.0-2.8', value: 18 },
      { label: '2.8-3.6', value: 44 },
      { label: '3.6-4.4', value: 73 },
      { label: '4.4-5.2', value: 66 },
      { label: '5.2-6.0', value: 39 },
    ],
    correlations: [
      { feature: 'Seasonal rainfall', value: 0.61 },
      { feature: 'Average temperature', value: -0.28 },
      { feature: 'Soil organic matter', value: 0.47 },
      { feature: 'Irrigation status', value: 0.39 },
    ],
    numericSummary: [
      { feature: 'Seasonal rainfall', mean: 742, median: 735, min: 312, max: 1210, standardDeviation: 168 },
      { feature: 'Average temperature', mean: 26.4, median: 26.1, min: 18.2, max: 34.8, standardDeviation: 3.7 },
      { feature: 'Soil organic matter', mean: 2.8, median: 2.7, min: 0.9, max: 5.6, standardDeviation: 1.1 },
    ],
    categoricalSummary: [
      { feature: 'Soil group', uniqueValues: 3, topCategories: [{ label: 'Loam', count: 112 }, { label: 'Clay', count: 76 }, { label: 'Sandy', count: 52 }] },
    ],
  },
  preprocessing: [
    { label: 'Identifiers excluded', detail: 'Farm and record identifiers were removed before splitting.' },
    { label: 'Missing values handled', detail: 'Numeric medians were learned independently within each training fold.' },
    { label: 'Categorical variables encoded', detail: 'Unknown-safe one-hot encoding was fitted on training data.' },
    { label: 'Numerical features scaled', detail: 'Standard scaling was applied inside each model pipeline.' },
    { label: 'Cross-validation prepared', detail: 'Five folds were used for tuning and model comparison.' },
  ],
  models: [
    { model: 'ridge', label: 'Ridge', r2: 0.82, mae: 0.31, rmse: 0.44, selected: true, parameters: ['alpha = 1.0'], crossValidation: '5-fold cross-validation (random state 42)', holdoutR2: 0.84, holdoutMae: 0.3, holdoutRmse: 0.42 },
    { model: 'lasso', label: 'Lasso', r2: 0.78, mae: 0.36, rmse: 0.49, selected: false, parameters: ['alpha = 0.05'], crossValidation: '5-fold cross-validation (random state 42)', holdoutR2: 0.8, holdoutMae: 0.35, holdoutRmse: 0.47 },
    { model: 'elastic-net', label: 'Elastic Net', r2: 0.8, mae: 0.34, rmse: 0.46, selected: false, parameters: ['alpha = 0.08', 'l1_ratio = 0.4'], crossValidation: '5-fold cross-validation (random state 42)', holdoutR2: 0.82, holdoutMae: 0.33, holdoutRmse: 0.44 },
    { model: 'random-forest', label: 'Random Forest', r2: 0.88, mae: 0.26, rmse: 0.37, selected: false, parameters: ['n_estimators = 300', 'random_state = 42'], crossValidation: '5-fold cross-validation (random state 42)', holdoutR2: 0.9, holdoutMae: 0.24, holdoutRmse: 0.35 },
  ],
  prediction: {
    label: 'Predicted yield',
    value: 4.72,
    unit: 't/ha',
    actualVsPredicted: [
      { actual: 2.6, predicted: 2.8 }, { actual: 3.1, predicted: 3.0 }, { actual: 3.7, predicted: 3.8 },
      { actual: 4.2, predicted: 4.0 }, { actual: 4.8, predicted: 4.7 }, { actual: 5.4, predicted: 5.2 },
    ],
    residuals: [-0.2, 0.1, -0.1, 0.2, 0.1, 0.2],
  },
  insights: [
    { feature: 'Seasonal rainfall', coefficient: 0.46, interpretation: 'Higher standardized rainfall values are associated with higher predicted yield within this demo dataset.' },
    { feature: 'Soil organic matter', coefficient: 0.31, interpretation: 'Higher standardized organic matter values are associated with higher predictions.' },
    { feature: 'Average temperature', coefficient: -0.19, interpretation: 'Higher standardized temperatures are associated with lower predictions in this fitted model.' },
  ],
  explanations: {
    en: 'Within this demo dataset, Ridge produced the strongest cross-validated performance. The model indicates associations, not causes. Seasonal rainfall and soil organic matter have positive standardized coefficients, while average temperature has a negative coefficient. The prediction should be interpreted within the range and conditions represented by the analyzed records.',
    hi: 'इस डेमो डेटासेट में रिज मॉडल ने क्रॉस-वैलिडेशन में सबसे मजबूत प्रदर्शन किया। मॉडल संबंध दिखाता है, कारण नहीं। मौसमी वर्षा और मिट्टी के जैविक पदार्थ के गुणांक सकारात्मक हैं, जबकि औसत तापमान का गुणांक नकारात्मक है। भविष्यवाणी को केवल विश्लेषित रिकॉर्ड की सीमा और परिस्थितियों के भीतर समझना चाहिए।',
    te: 'ఈ డెమో డేటాసెట్‌లో రిడ్జ్ మోడల్ క్రాస్-వాలిడేషన్‌లో ఉత్తమ పనితీరును చూపింది. ఈ మోడల్ సంబంధాలను సూచిస్తుంది, కారణాలను కాదు. కాలానుగుణ వర్షపాతం మరియు నేల సేంద్రియ పదార్థానికి ధనాత్మక గుణాంకాలు ఉండగా, సగటు ఉష్ణోగ్రతకు ప్రతికూల గుణాంకం ఉంది. విశ్లేషించిన రికార్డుల పరిధి మరియు పరిస్థితులలోనే అంచనాను అర్థం చేసుకోవాలి.',
  },
  caveats: [
    'Demo values illustrate the frontend contract and do not describe an uploaded dataset.',
    'Regression coefficients describe model associations and should not be interpreted as causal effects.',
    'The real backend must return evaluation evidence before a best model is displayed.',
  ],
}

export const runDemoAnalysis = async () => demoAnalysisReport
