import type { DatasetSummaryData, ExplanationResponse, Language, PredictionResponse } from '../types/cropcast'

export const demoDataset: DatasetSummaryData = {
  datasetId: 'demo-field-trials',
  fileName: 'sample-field-trials.csv',
  rowCount: 240,
  columnCount: 6,
  columns: [
    { id: 'observed_yield', label: 'Observed yield', dataType: 'number', nullable: false, unit: 't/ha', eligibleAsTarget: true, eligibleAsFeature: false },
    { id: 'rainfall', label: 'Seasonal rainfall', dataType: 'number', nullable: false, unit: 'mm', eligibleAsTarget: false, eligibleAsFeature: true },
    { id: 'temperature', label: 'Average temperature', dataType: 'number', nullable: false, unit: '°C', eligibleAsTarget: false, eligibleAsFeature: true },
    { id: 'soil_group', label: 'Soil group', dataType: 'category', nullable: false, allowedValues: ['Alluvial', 'Black', 'Red'], eligibleAsTarget: false, eligibleAsFeature: true },
    { id: 'irrigated', label: 'Irrigated', dataType: 'boolean', nullable: false, allowedValues: [true, false], eligibleAsTarget: false, eligibleAsFeature: true },
    { id: 'plot_reference', label: 'Plot reference', dataType: 'text', nullable: false, eligibleAsTarget: false, eligibleAsFeature: false },
  ],
}

export const demoPrediction: PredictionResponse = {
  predictionId: 'demo-prediction',
  targetColumnId: 'observed_yield',
  value: 4.6,
  unit: 't/ha',
  model: 'ridge',
  notices: ['Sample output for interface demonstration only.', 'This value was not calculated from an uploaded dataset.'],
}

export const demoExplanations: Record<Language, ExplanationResponse> = {
  en: {
    predictionId: 'demo-prediction',
    language: 'en',
    text: 'This sample result demonstrates how CropCast will explain a prediction. The final explanation will come from your API and will reference only the selected model, submitted inputs, and validated model evidence.',
  },
  hi: {
    predictionId: 'demo-prediction',
    language: 'hi',
    text: 'यह नमूना परिणाम दिखाता है कि CropCast किसी पूर्वानुमान को कैसे समझाएगा। अंतिम व्याख्या आपके API से आएगी और केवल चुने गए मॉडल, दिए गए इनपुट और सत्यापित मॉडल साक्ष्य का संदर्भ देगी।',
  },
  te: {
    predictionId: 'demo-prediction',
    language: 'te',
    text: 'ఈ నమూనా ఫలితం CropCast అంచనాను ఎలా వివరిస్తుందో చూపిస్తుంది. తుది వివరణ మీ API నుండి వస్తుంది మరియు ఎంచుకున్న మోడల్, సమర్పించిన ఇన్‌పుట్‌లు, ధృవీకరించిన మోడల్ ఆధారాలను మాత్రమే సూచిస్తుంది.',
  },
}
