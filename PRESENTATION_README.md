# CropCast: understand the project and present it

Code-reviewed on October 12, 2026. This is a self-contained study guide for the person demonstrating the website and for ChatGPT acting as a presentation coach.

The screenshot supplied for this guide shows the report menu, not the numerical results. **All small numerical examples below are teaching examples, not claimed results from your upload.** Read the live report when presenting. Dataset, target, features and validation strategy can change the winning model and scores.

## How to use this guide

1. Read sections 1–3 to understand the project.
2. Rehearse section 4 while clicking through the nine menu items.
3. Study sections 5–9 for formulas, algorithms and low/high values.
4. Use section 12 as your live speaking script.
5. Give this entire file to ChatGPT with the prompt in section 15.

Contents:

- 1. The project in plain English
- 2. Words you need before discussing ML
- 3. What happens from upload to prediction
- 4. Every sidebar section: what it means and what to say
- 5. Metrics and worked calculations
- 6. The four algorithms and their formulas
- 7. Validation: what we really tested
- 8. Preprocessing and exploratory formulas
- 9. Model associations: reading the bars correctly
- 10. The datasets and the separate real-data benchmark
- 11. Architecture, project work and honest limitations
- 12. Presentation scripts and demo checklist
- 13. Viva questions and answers
- 14. One-page revision sheet
- 15. Prompt to give ChatGPT
- 16. Implementation map and reference notes

## 1. The project in plain English

CropCast is a local web application for analyzing a table of agricultural observations and predicting a numerical outcome, such as crop yield.

You upload historical records containing inputs and a known answer. The backend compares four regression models, checks their errors against a simple reference model, selects the candidate with the lowest cross-validated RMSE, and creates a report. You can then enter the inputs for one new observation and ask the selected model to estimate its unknown outcome.

**A sentence you can say:**

> “CropCast lets us upload agricultural data, compare four regression models, inspect their errors and data-quality warnings, and estimate the yield or another numeric target for one new record.”

The project is a working tabular ML workflow, not a pretrained model that already knows every farm. It learns from the uploaded dataset. It does not measure weather, connect to field sensors, or discover missing facts about a farm.

### Why this is regression

The output is a number, such as 4.2 tonnes per hectare. That is regression. Classification would predict a category, such as “disease present” or “disease absent.” CropCast compares regressors; a classification accuracy percentage is not its main evaluation measure.

### Yield versus total production

Yield is output per unit of land. Production is total output.

```text
yield = production / harvested area       (when units are compatible)
production = yield × harvested area

Example: 4 t/ha × 2 ha = 8 tonnes
```

Do not call every numeric result “yield” if your selected target is actually production. Also check the dataset's real units. CropCast guesses some display units from column names and labels them “inferred”; that guess is not verified metadata.

## 2. Words you need before discussing ML

| Word | Simple meaning | CropCast example |
|---|---|---|
| Dataset | A table of observations | An uploaded CSV |
| Row / record | One observation at the table's measurement level | A field-season, or a country-year |
| Column | A type of information | Rainfall, soil type, yield |
| Feature / X | An input available before the outcome | Rainfall or irrigation |
| Target / y | The numeric answer we want to estimate | `yield_t_ha` |
| Numerical | A measured or counted number | Temperature |
| Categorical | A label or group | Loam, Clay, Sandy |
| Training | Learning a mapping from inputs to known answers | Fitting a regression model |
| Prediction / ŷ | The model's estimated answer | Estimated yield for entered inputs |
| Validation | Testing on rows excluded from a particular fit | Cross-validation |
| Baseline | A deliberately simple comparison | Predicting the training mean |
| Generalization | Working on cases not used for a fit | New fields or later years |
| Overfitting | Learning peculiarities of training data that do not transfer | Low training error but poor new-case error |
| Underfitting | A model missing useful structure | An additive model missing a threshold |
| Leakage | Using information that reveals the answer or would not be available in real use | Production and area that directly define yield |
| Hyperparameter | A setting chosen before fitting | Number of trees, regularization strength |

**Training versus prediction:** training learns from many historical rows with known targets. Prediction applies the fitted mapping to one input row whose target is unknown. You do not enter the target into the prediction form.

## 3. What happens from upload to prediction

```text
Browser: select CSV / XLSX / single-CSV ZIP
    → React sends file to the local FastAPI backend
    → pandas reads the table and checks basic validity
    → detect numeric target candidates; ask user if ambiguous
    → choose usable features and exclude obvious leakage/IDs
    → keep rows with a numeric target
    → construct validation splits
    → fit preprocessing + each model within training folds
    → make out-of-fold predictions and calculate CV metrics
    → compare four candidates with a training-mean baseline
    → select lowest-CV-RMSE candidate
    → fit selected pipeline on all usable labelled rows
    → return report, diagnostics, associations and summary
    → user enters one new input record
    → reuse fitted pipeline to return prediction + error band
```

Upload limit: 10 MB. ZIP files must contain exactly one CSV, whose extracted size is also checked. The table needs at least two columns and eight rows; training needs at least eight usable numeric target values and one eligible nonconstant feature. Eight is a technical minimum, not enough evidence for dependable real-world predictions.

Target detection looks for varying, eligible numeric columns whose names contain `yield`, `production`, `output` or `harvest`. If none have these hints, other eligible numeric columns are offered. If there is more than one candidate, the user must select the target.

Rows without usable numeric target values cannot teach the answer and are excluded from fitting and evaluation. Missing feature values are handled by the model pipeline, not by inventing target values.

**What you say while the upload runs:**

> “The backend is reading this table and fitting the comparison models. The report comes from this upload, rather than numbers calculated by the browser or a fixed result for every dataset.”

Exception: **Run demo analysis** loads a saved report. Uploading the downloadable sample CSV performs actual training and enables manual prediction.

## 4. Every sidebar section: what it means and what to say

### 4.1 Overview

**What you see:** file name/type/size, detected files, total rows and columns, selected target, numerical feature count and categorical feature count.

**Meaning:** this describes the table and the inputs retained for modeling. Total uploaded rows can exceed the usable labelled rows shown in validation notes. Feature counts do not include the target or every excluded column. One categorical input can later become several one-hot encoded columns.

**Say:**

> “This is the dataset overview. A row represents one observation, the features are our inputs, and the target is the numeric outcome we want to estimate. The retained feature counts are not necessarily the same as the uploaded column count.”

**If counts are low/high:** more diverse, relevant observations can help, but more rows or columns do not automatically mean better predictions. Repeated rows, irrelevant columns and leaked answers can make a large dataset misleading. Check what a row actually represents before calling it a farm.

### 4.2 Compare models

**What you see:** Ridge, Lasso, Elastic Net, Random Forest and a mean baseline; CV R², CV MAE, CV RMSE, diagnostic holdout RMSE, selection and validation notes.

**Meaning:** each candidate is evaluated under the chosen strategy. The winner is chosen by the **lowest cross-validated RMSE**, not by the largest prediction, holdout score or feature importance. Fixed candidate settings are compared; this is not an automatic hyperparameter search.

**Say:**

> “We compare four regressors and a simple model that always predicts the training mean. Lower MAE and RMSE mean smaller prediction errors. R-squared compares squared error with predicting the evaluated-set mean; it is not an accuracy percentage. The selected candidate has the lowest cross-validated RMSE.”

**Important:** selection still happens when all four candidates perform poorly. The app separately checks whether the selected candidate has **more than 5% lower CV RMSE** than the baseline. Otherwise it displays an uninformative-signal warning. This margin is a project rule, not a statistical significance test.

### 4.3 Predict a new record

**What you do:** enter one observation's feature values, or choose **Fill typical inputs**, then **Predict new record**.

**Meaning:** the form uses the report's target and feature set. The selected model is fitted on all usable labelled upload rows for this prediction. The target is read-only because it is the answer, not an input. Typical inputs use numeric medians and categorical modes; their combination may never have occurred as a real row.

**Say:**

> “Now I am entering inputs for one new record. The model estimates its unknown target using the patterns learned from the upload. This is a prediction for these inputs, not the average of the dataset and not an extra test row.”

**Low/high result:** low predicted yield means a lower estimated output per area for that input profile; it does not by itself mean the software failed. High predicted yield is not evidence of model accuracy either. Evaluate reliability with errors, baseline, validation and data coverage. Do not turn an input experiment into a farming recommendation.

**Error band:** the normal path returns `prediction ± 1.96 × model CV RMSE`. It is a heuristic error band, **not a calibrated 95% prediction interval**. The backend has an in-sample fallback if the relevant CV RMSE is unavailable; the response discloses it, and it can understate error.

### 4.4 Testing evidence

**What you see:** actual versus predicted values for historical holdout observations, residual bars, preview expansion and CSV export.

**Meaning:** the actual value is known from the uploaded target; the predicted value was produced by a model fitted without that holdout. A residual is `actual − predicted`.

**Say:**

> “These are historical holdout comparisons. When actual and predicted are close, that record's error is small. A positive residual means underprediction; a negative residual means overprediction. The chart is diagnostic evidence, not proof of accuracy on every future farm.”

The first preview shows 10 comparisons. The API returns all holdout comparisons up to a cap of 250, otherwise an evenly spaced sample of 250. Export contains the returned comparisons, not automatically every source row. The evaluated metrics use their full evaluated sets, not only the displayed preview.

“Test record 1” is a display position, not an original row ID or a generated sample. The diagnostic holdout overlaps rows used in model-selection CV; **it is not an untouched final test**.

### 4.5 Data quality

| Check | Meaning | What CropCast actually does |
|---|---|---|
| Missing values | Empty cells across the upload | Imputes missing features within fits; excludes unusable targets |
| Duplicate rows | Identical repeated rows | Reports and retains them |
| Constant columns | No useful variation | Excludes them from candidate features |
| Outlier indicators | Feature values outside IQR fences | Flags affected rows; does not delete them |
| Target redundancy | Very high correlation or exact arithmetic definitions | Warns at absolute correlation ≥ 0.95; excludes detected target-defining feature pairs |
| Train/test overlap | Repeated categorical/entity values across partitions | Reports detected overlap and recommends suitable validation |
| Leakage checks | Certain obvious unsuitable inputs excluded | Reports exclusions; not a guarantee against all leakage |

**Say:**

> “This section helps us judge whether the dataset supports a trustworthy analysis. Missing features are handled in the pipeline. Duplicates and outliers are disclosed rather than silently removed, and suspicious relationships with the target need review.”

Zero missing cells or outlier flags is reassuring about those checks only. Many flagged cells/rows warrant investigation, but an outlier can be a genuine unusual season. “Passed” does not establish clean provenance, valid units, or no hidden future information.

### 4.6 Exploration

**What you see:** target distribution, Pearson correlations, numerical summaries and categorical counts.

**Say:**

> “Before trusting the model, we examine the data. The distribution shows how often different target ranges occur. Correlations describe linear relationships with numeric features. The summaries show typical values, spread and which categories are represented.”

- Target-distribution bar height is a row count, not model accuracy or average yield. A low bar means fewer examples in that range.
- Correlation runs from −1 to +1. A negative value is not an error; it describes an inverse linear association. A value near zero can still hide a nonlinear relationship or interaction.
- A large standard deviation means greater spread, not automatically worse data.
- A category with few examples is less well supported than a common category. Counts are not coefficients or causal effects.

### 4.7 Preprocessing

**What you see:** identifiers excluded, missing values handled, categories encoded, numeric features scaled and cross-validated evaluation used.

**Say:**

> “We convert the table into inputs the models can use. Numeric missing values use training medians, categorical missing values use training modes, categories use one-hot encoding, and numeric inputs use standard scaling. These transformations are fitted inside each training fold so validation rows do not supply their imputation or scaling statistics.”

Do not say everything is cleaned automatically. Duplicate rows and IQR outliers remain. Some leakage screens inspect the full upload before validation, so fold-fitted preprocessing does not make the entire model-selection process perfectly independent.

### 4.8 Model associations

The sidebar calls this **Model associations**, but the section heading currently says **What drove the estimate**. Explain it as association/model reliance, not as a causal diagnosis of this specific record.

**What you see:** a method label and up to five ranked entries. For a selected linear model, these are coefficients on transformed inputs. For Random Forest, they are permutation importance values.

**Say:**

> “These bars show the strongest reported associations for the fitted model. The method depends on the winning algorithm. Coefficients have a direction; permutation importance measures how much error changes after shuffling a feature and has no direction. Neither proves a causal effect.”

Do not interpret a tiny value as low yield or a large value as high accuracy. These values measure something different. Section 9 explains why a bar can be small, large, zero or negative.

### 4.9 Automated summary

**What you see:** a summary in English, Hindi or Telugu, optional voice playback and caveats.

**Say:**

> “This summary turns the model name, target and strongest reported association into readable text. It uses deterministic language templates, not a generative AI service. The voice option reads it using browser speech synthesis when a suitable voice is available.”

Changing language does not change training, the prediction or the metrics. Field-summary requests reuse global fitted-model associations; they do not compute a new local explanation such as SHAP for that record. Text availability does not guarantee that the browser has a voice for that language.

## 5. Metrics and worked calculations

Use `yᵢ` for the known target, `ŷᵢ` for its prediction, `n` for evaluated records, and `ȳ` for the mean of evaluated actual targets. `Σ` means add over the records; `| |` means absolute value; `√` means square root.

### 5.1 Residual

```text
residualᵢ = yᵢ − ŷᵢ
```

Actual 5 and predicted 4 gives +1: underprediction. Actual 3 and predicted 4 gives −1: overprediction. A residual close to zero is good for that observation. A simple average of residuals can hide large errors because positive and negative errors cancel.

### 5.2 MAE: mean absolute error

```text
MAE = Σ |yᵢ − ŷᵢ| / n
```

Take each error's magnitude, add those magnitudes, and divide by the number of records. If MAE is 0.3 t/ha, the evaluated predictions differ from actual values by 0.3 t/ha on average in absolute magnitude. It does not mean every error is exactly 0.3. Lower is better; zero means no error on those evaluated observations. [S1]

### 5.3 MSE and RMSE

```text
MSE  = Σ (yᵢ − ŷᵢ)² / n
RMSE = √MSE
```

Squaring makes large misses contribute disproportionately; taking the root restores the target's units. MSE has squared target units. RMSE has target units and is normally at least as large as MAE when both use the same records. Lower RMSE is better; zero means exact agreement on those records. CropCast calculates RMSE as the square root of scikit-learn's mean squared error. [S1]

### 5.4 R²: coefficient of determination

```text
R² = 1 − Σ(yᵢ − ŷᵢ)² / Σ(yᵢ − ȳ)²
```

For a nonconstant evaluated target, it compares the model's squared error with the error from always predicting that evaluated set's mean. A score of 1 is perfect agreement, 0 matches that mean reference, and a negative value is worse. It is unitless and **not a percentage of correct predictions**. Small samples and constant targets can make it unstable or undefined. [S1]

Say “R² is 0.8,” not “our accuracy is 80%.” Also distinguish this mathematical mean reference from CropCast's separately fitted DummyRegressor, which uses each training set's mean. The latter's validation R² need not be exactly zero.

### 5.5 Calculate an example yourself

```text
Actual:       2, 4, 6
Predicted:    3, 4, 5
Residuals:   −1, 0, 1
Absolute:     1, 0, 1
Squared:      1, 0, 1

MAE  = 2 / 3                    = 0.6667 target units
MSE  = 2 / 3                    = 0.6667 squared units
RMSE = √(2 / 3)                 = 0.8165 target units
ȳ    = 4
R²   = 1 − 2 / (4 + 0 + 4)     = 0.75
```

The mean signed residual is zero, but MAE and RMSE are not zero. That is why signed errors alone cannot measure overall quality.

### 5.6 Baseline improvement and the error band

```text
RMSE improvement % = 100 × (baseline RMSE − selected RMSE) / baseline RMSE

Example: baseline 0.8, selected 0.5 → 37.5% lower RMSE
Example: baseline 0.8, selected 0.78 → 2.5% lower RMSE
```

The second example does not pass CropCast's more-than-5% margin. Exactly 5% is also insufficient because the code uses a strict comparison. Improvement can be negative if the selected candidate is worse than the baseline. It is not an “accuracy percentage.”

```text
Prediction example = 4.00 t/ha
CV RMSE example    = 0.50 t/ha
Half-width         = 1.96 × 0.50 = 0.98 t/ha
Displayed band     = 3.02 to 4.98 t/ha
```

The factor 1.96 resembles a familiar normal-distribution multiplier, but CropCast does not establish the assumptions or verify coverage needed to call this a 95% interval. The band is symmetric and mostly reflects a model/strategy-level error, not separate uncertainty calibrated for each input. It can extend below zero; it is not constrained to physically possible yield values.

## 6. The four algorithms and their formulas

### 6.1 Start with an additive prediction

For the three linear models, the prediction has this form on the **transformed** input columns:

```text
ŷ = b + w₁x₁ + w₂x₂ + … + wₚxₚ
```

`b` is the intercept; `w` values are fitted coefficients; `p` is the number of transformed inputs. Numeric inputs are standardized and categorical inputs are encoded. The weights are learned from data, not manually assigned farming rules. [S2]

Regularization penalizes large weights while fitting, balancing training fit against model complexity. It can reduce instability but does not guarantee generalization. The target is not standardized in this app.

### 6.2 Ridge: squared-weight penalty

```text
Minimize: Σ(yᵢ − ŷᵢ)² + α Σwⱼ²
CropCast: alpha = 1.0
```

Ridge uses an L2 penalty, generally shrinking weights rather than producing sparse exact-zero weights. It can be helpful with correlated inputs. Larger alpha applies stronger shrinkage; too much can underfit. [S3]

**Say:** “Ridge is regularized linear regression. It discourages large coefficients to make the fitted relationship less sensitive to the training data.”

### 6.3 Lasso: absolute-weight penalty

```text
Minimize: (1 / 2n) Σ(yᵢ − ŷᵢ)² + α Σ|wⱼ|
CropCast: alpha = 0.05; max_iter = 10,000
```

Lasso uses an L1 penalty and can set coefficients exactly to zero. That is one reason a reported association can be zero or tiny. A zero coefficient means the fitted model does not use that transformed input in its additive prediction, not that the feature is scientifically irrelevant. [S4]

**Say:** “Lasso adds a penalty that can remove some inputs from the fitted linear equation by shrinking their coefficients to zero.”

### 6.4 Elastic Net: combine both penalties

```text
Minimize: (1 / 2n) Σ(yᵢ − ŷᵢ)²
          + α × ρ × Σ|wⱼ|
          + (α × (1 − ρ) / 2) × Σwⱼ²

CropCast: alpha = 0.08; l1_ratio (ρ) = 0.4; max_iter = 10,000
```

Elastic Net mixes L1 and L2 regularization. Here `l1_ratio=0.4` sets the mixture; it is not a 40% accuracy or probability. It can provide sparsity while handling correlated predictors. [S5]

**Say:** “Elastic Net combines Lasso's and Ridge's penalty styles. We include it as another regularized linear candidate.”

**Do not directly compare alpha numbers across these estimators.** Ridge and Lasso/Elastic Net use different objective normalizations. These are fixed project settings, not proven optimal settings for every dataset.

### 6.5 Random Forest: average many trees

```text
ŷ(x) = (tree₁(x) + tree₂(x) + … + treeT(x)) / T
```

A regression tree learns input thresholds that reduce squared error and uses the training targets in a leaf to make its estimate. A forest averages many such trees fitted on bootstrap samples. It can represent nonlinear patterns and interactions without this app explicitly adding polynomial/interaction columns. More trees are not an accuracy guarantee. [S6]

CropCast normally uses 300 trees with `random_state=42`. Above 5,000 usable labelled rows, it uses 60 trees, a per-tree bootstrap budget of 2,500 rows and parallel tree fitting to reduce computation. The report returns the actual settings.

The implementation leaves `max_features` at the regressor default of 1.0: all transformed features are available at a split. Do not claim this configuration always draws a smaller random feature subset at each split. [S6]

**Say:** “Random Forest combines many decision trees. It can capture thresholds and interactions that the current additive linear candidates may miss. We still let validation determine whether it performs better.”

### 6.6 The baseline is not a fifth serious candidate

The mean DummyRegressor predicts the training-set average regardless of inputs. It answers: “Are these more complex models better than guessing a typical answer?” Its mean is recalculated within training folds. It is a reference, not one of the four selectable winners.

### 6.7 How to explain whichever model wins

- Forest wins: “The forest had the smallest CV RMSE here. Its flexibility may help with nonlinear patterns; this result is specific to the data and strategy.”
- Ridge wins: “The regularized linear relationship transferred better under this evaluation. More complex did not mean better.”
- Lasso wins: “A sparse regularized linear fit produced the smallest evaluated RMSE.”
- Elastic Net wins: “The combined-penalty linear fit produced the smallest evaluated RMSE.”
- All weak: “The comparison still selects a candidate, but the baseline warning means useful predictive signal has not been established.”

None of these outcomes proves exactly why it won. The app does not run a causal experiment or uncertainty test for differences between candidate scores.

## 7. Validation: what we really tested

### 7.1 Random validation

The default holdout is approximately 75% training and 25% testing, with a fixed seed of 42. Separately, shuffled K-fold CV uses all usable labelled rows: each fold fits on its training rows and predicts its withheld rows.

The fold count is `min(5, max(2, usable_rows // 4))`. Thus a typical larger upload uses five folds, but an eight-row upload uses two. Do not say every upload always gets five-fold CV.

**Example:** with 100 usable rows and five folds, each CV fit normally trains on 80 and tests on 20. Separately, the diagnostic holdout trains on 75 and tests on 25. These are different fitting procedures, not a five-fold split of only the 75 holdout-training rows.

CropCast assembles out-of-fold predictions and computes metrics across all CV-tested observations. It does not merely take an unweighted average of five displayed fold RMSEs.

**Say:** “Cross-validation checks how the model predicts observations excluded from each fit. Random validation can still place records from the same farm or period on both sides, so it may answer an easier question than predicting a new farm or future season.”

### 7.2 Grouped validation

When a suitable entity column is detected, GroupKFold keeps each group's records together. A separate GroupShuffleSplit holds out about 25% of groups; that need not mean exactly 25% of rows. The number of CV folds also cannot exceed the number of groups.

**Example:** all observations of field F001 belong on one side of a split, not partly in training and partly in testing.

**Say:** “Grouped validation asks whether the relationship transfers to unseen entities. The grouping column is shown in the report. It is stricter for that question than reusing known fields across partitions.”

Grouping by a field does not guarantee every region or soil category is unseen. Other categorical values can still repeat. Check which entity was actually chosen.

### 7.3 Temporal validation

When a recognized date/time/year column has complete valid values on labelled rows and at least three distinct periods, forward-chaining CV trains on earlier periods and tests on later periods. Whole equal periods stay together. The diagnostic holdout contains the latest roughly 25% of distinct periods, not necessarily 25% of rows.

The earliest training-only rows are not CV-tested, so metrics use the later covered rows. A `season` label alone is not automatically a valid chronological axis; use a meaningful year or date. Prefer ISO dates `YYYY-MM-DD` to ambiguous regional strings.

**Say:** “Temporal validation tests earlier-to-later prediction inside this dataset. It avoids training a fold on future periods, but it still needs features that would truly be available when a forecast is made.”

### 7.4 Why scores can get worse

Random, grouped and temporal strategies test different forms of generalization. A decline after choosing grouped or temporal validation can reveal dependence on familiar entities or periods. Choose a strategy to match the intended use, not just to obtain the best-looking score.

The normal app report is exploratory: CV selects the model using uploaded labelled rows, and the displayed diagnostic holdout overlaps that selection process. Full-upload target-related feature screening is another limitation. For stronger evidence, predefine features and reserve an untouched final test or use nested validation. The separate benchmark in section 10 has a different protocol.

## 8. Preprocessing and exploratory formulas

### Missing features: median and mode

Median is the middle value after sorting. The median of 10, 20 and 90 is 20; the mean is 40. Median imputation is less sensitive to a very large value than mean imputation. Mode is the most frequent category, such as Loam when it occurs most often.

Within each validation fit, these replacements are learned from that fit's training rows. The final prediction pipeline learns them from all usable labelled rows. **Fill typical inputs** is an illustrative UI shortcut drawn from upload-level medians/modes, not the held-out evaluation procedure.

### Standard scaling

```text
z = (x − μ_train) / σ_train
Example: x = 700, training mean = 600, training std = 100 → z = 1
```

A positive standardized value is above the training mean; negative is below; zero is at it. It is not a probability. Scaling helps the penalties of linear models operate on comparable numeric scales. The same pipeline scales inputs for the forest too, although trees generally do not require standard scaling. [S7]

### One-hot encoding

```text
soil_type = Loam  → [Loam: 1, Clay: 0, Sandy: 0]
soil_type = Clay  → [Loam: 0, Clay: 1, Sandy: 0]
```

This avoids treating category names as an artificial numeric ranking. The app uses unknown-safe encoding: an unseen category does not crash prediction, but its category indicators are all zero and a notice explains that it contributed no encoded category information. That does not make predictions for unseen categories reliable.

### Mean, median and spread

```text
mean = Σxᵢ / n
population standard deviation = √[Σ(xᵢ − mean)² / n]
IQR = Q3 − Q1
outlier fences = Q1 − 1.5 × IQR, Q3 + 1.5 × IQR
```

The numerical profile uses population standard deviation (`ddof=0`). Minimum and maximum describe the observed range. If mean and median differ substantially, skew or extreme observations may contribute. IQR is the middle-half spread; CropCast flags rows with a retained numeric feature outside its fences. It does not remove those rows, and a flag is not proof of a faulty reading.

### Pearson correlation

```text
r = Σ[(xᵢ − x̄)(yᵢ − ȳ)]
    / √[Σ(xᵢ − x̄)² × Σ(yᵢ − ȳ)²]
```

It measures a pairwise linear relationship on available paired values. Near +1: strong increasing association. Near −1: strong decreasing association. Near zero: little linear association, not proof of no relationship. It does not control for every other input and does not establish causation. Constant variables can make it undefined.

### Leakage example

If `production / area` reproduces `yield`, feeding both production and area to a yield model may reveal the answer. CropCast checks exact ratio/product definitions, including a consistent conversion scale and stored rounding, and excludes detected defining pairs. It only warns about very high single-column correlation because genuine useful predictors can also be strongly correlated.

Not every real leak has an obvious name or arithmetic definition. A measurement recorded after harvest might leak outcome information despite passing these checks.

## 9. Model associations: reading the bars correctly

### 9.1 When the winner is Ridge, Lasso or Elastic Net

Numeric coefficients describe the additive prediction change for a one-standard-deviation increase in that numeric input, holding other transformed inputs fixed. Positive means higher predicted target; negative means lower. A coefficient of −0.2 is not negative accuracy.

**Teaching example:** rainfall coefficient +0.30, rainfall scaling standard deviation 100 mm. Increasing rainfall by 100 mm changes the fitted additive prediction by +0.30 target units if other inputs stay fixed. Increasing by 10 mm corresponds to +0.03. This is a model relationship, not evidence that adding water causes exactly that harvest gain.

The UI calls the method “Standardized coefficients,” but **only numeric inputs are standardized**. One-hot categorical indicators remain 0/1. Their coefficients describe encoded category terms, not one-standard-deviation changes. With all category indicators retained and an intercept, prefer a contrast between two categories rather than treating one indicator coefficient as a universal effect against a dropped reference category. Mixed categorical/numeric bars are not perfectly comparable effect sizes.

Small absolute coefficients can reflect weak additive associations, shrinkage, correlated/redundant inputs or a model unable to capture nonlinear structure. A larger magnitude means a larger fitted prediction change per transformed-input unit, not higher accuracy or a causal effect. The coefficient is `w`; an individual record's contribution is `w × x`, so a small coefficient does not necessarily imply a small contribution for every possible input.

### 9.2 When the winner is Random Forest

```text
importance(feature) = average shuffled-feature RMSE − unshuffled RMSE
```

The app shuffles one original input column repeatedly and measures the change in RMSE. Breaking that column's relationship with the target tests reliance on it. The ordinary path uses 10 repeats; above 3,000 usable rows it measures on a seeded 3,000-row sample with five repeats. It uses rows from the full-fit training dataset, not an independent attribution holdout. [S8]

| Value | Correct interpretation |
|---|---|
| +0.40 target units | Shuffling raised RMSE by about 0.40 |
| Near zero | Shuffling barely changed this model's error on these rows |
| Negative | Shuffling improved error; investigate noise or an unhelpful relationship |

A positive value **does not mean** increasing the feature increases yield. For example, a pest feature can be highly important because it helps the model predict lower yields. Permutation importance has no effect direction.

Correlated substitute features can mask individual importance. Importance belongs to this fitted model and measurement dataset, not to the feature universally. Training-set measurement may look different from held-out measurement. [S9]

### 9.3 Why a short bar or small decimal is not automatically bad

1. First read the method: coefficient or permutation importance?
2. Read its sign, units and interpretation, not just its size.
3. The target may naturally be measured in small units.
4. The feature may add little information beyond other inputs.
5. A linear penalty may shrink its coefficient.
6. Nonlinear structure may not appear as a large linear coefficient or correlation.
7. The UI rounds values, so a tiny nonzero value can appear as `0.00`.

Bars use a display scale based on the largest returned magnitude with a minimum scale of 1, plus a minimum visible width. **They are not percentages and do not have to sum to 100%.** Only up to five entries are shown, ranked by absolute magnitude; an omitted feature is not necessarily unused.

**An answer to “Why is this value low?”**

> “This is an association value, not predicted yield or accuracy. A small absolute coefficient means a small fitted prediction change per unit of that transformed input. A small permutation importance means shuffling this feature barely changed the model's error on the measured rows. I would check the method, rounding and overlapping information with other features before interpreting it.”

### 9.4 One table for low and high values

| Value on screen | Low / near zero | High | Negative |
|---|---|---|---|
| Predicted yield | Lower estimated output per area | Higher estimated output per area | May be physically implausible; examine model/data |
| MAE / RMSE | Smaller evaluated error | Larger evaluated error | Not valid for these error metrics |
| R² | Near 0: little benefit versus evaluated-set mean | Near 1: strong agreement on evaluated observations | Worse than evaluated-set mean reference |
| Residual | Near 0: close prediction | Large magnitude: a large miss | Overprediction |
| Pearson correlation | Little linear association near 0 | Strong association near +1 or −1 | Inverse linear association |
| Linear coefficient | Small change per transformed-input unit; may be shrunk | Larger change per transformed-input unit | Higher transformed input lowers fitted prediction |
| Permutation importance | Little RMSE change when shuffled | More RMSE increase when shuffled | Shuffling improved RMSE, not a downward yield effect |
| Standard deviation | Less spread | More spread | Not valid |
| Distribution/category count | Few observations | Many observations | Not valid |
| Missing/duplicate/outlier count | Fewer detected issues | More rows/cells to inspect | Not valid |
| Error-band width | Smaller heuristic uncertainty display | Larger error-based band | Width itself cannot be negative |

No universal RMSE threshold defines “good.” Compare errors with the baseline, target range/units, intended decision and validation conditions. An RMSE of 0.5 means something different for a target typically near 4 than one typically near 100, and changing units rescales it.

## 10. The datasets and the separate real-data benchmark

### 10.1 Bundled field-trials sample: synthetic

The bundled `sample-field-trials.csv` is generated, not collected from actual farms. Its generator creates 96 field identities across three season labels, giving 288 rows and 12 columns. Inputs include region, season, soil, irrigation, rainfall, temperature, fertilizer, pest pressure and sowing density. The target is `yield_t_ha`; identifier/date columns are excluded from modeling.

The generator deliberately combines nonlinear relationships, noise, missing features and a few unusual readings:

```text
synthetic yield = 2.30 + region term + soil term + irrigation term
                  + rainfall response + temperature response
                  + fertilizer response + pest response
                  + random noise + a weak density term

fertilizer response = 0.62 × ln(1 + fertilizer / 45)
temperature response = −0.0022 × (temperature − 27)²
pest response = −1.45 × max(pest_pressure − 0.45, 0) / 0.55
```

For irrigated records, rainfall response is `0.00035 × min(rainfall, 950)`. For nonirrigated records it is `0.0021 × min(rainfall, 950) − 0.0016 × max(rainfall − 950, 0)`. The random noise has standard deviation 0.26 in the generator's target units; density contributes `0.0004 × (density − 250)`.

**These are synthetic data-generation formulas, not CropCast's prediction algorithm and not scientifically validated agronomic laws.** The models fit examples generated by them; they are not given these formulas. The structure helps demonstrate diminishing returns, thresholds and interactions that the current additive linear models may miss.

**Say:** “This sample is synthetic. It lets us demonstrate the workflow with known nonlinear patterns and data-quality problems. Its scores do not prove real-farm accuracy.”

### 10.2 Saved demo report

The saved demo is an offline, precomputed report. It is useful as a fallback, but its result is not newly trained during that click. Manual new-record prediction requires uploading a supported dataset with the API running. Always disclose which workflow you are demonstrating.

### 10.3 Real wheat snapshot and locked benchmark

A separate snapshot contains national annual wheat yields for Bangladesh, China, India, Nepal and Pakistan, with attribution stored to FAO and Our World in Data. The stored snapshot covers 1961–2024; it includes country-specific previous-year yield. It was retrieved on October 6, 2026. These are **country averages, not farm observations**.

The existing benchmark artifact reports:

| Item | Stored benchmark result / protocol |
|---|---|
| Training years | 1962–2019, 290 labelled rows with lag input |
| Reserved final test | 2020–2024, 25 country-year rows |
| Inputs | Country, year, previous-year yield |
| Selection | Earlier-year expanding-window CV; Ridge selected |
| Selected-model final-test RMSE / MAE / R² | 0.1034 t/ha / 0.0870 t/ha / 0.9905 |
| Training-mean final-test RMSE | 1.9665 t/ha |
| Previous-year baseline final-test RMSE | 0.1200 t/ha |

These numbers are quoted from the repository's saved benchmark, **not a fresh benchmark run in this documentation task**. It beats the previous-year baseline on pooled RMSE, but not in every country. High pooled R² partly reflects differences between countries; it is not 99.05% farm-level accuracy.

The benchmark uses rolling one-year-ahead evaluation with preceding realized yields, not a five-year forecast made at one starting date. It does not model historical publication delays or data revisions, so it is not an as-of historical backtest. Countries repeat; no unseen-country ability is established.

Uploading this same CSV through the ordinary UI uses the app's exploratory validation, **not automatically the locked benchmark**. Keep the two protocols and their results separate.

## 11. Architecture, project work and honest limitations

### 11.1 Who does what

| Layer | Tools in this repository | Responsibility |
|---|---|---|
| Frontend | React, TypeScript, React Router, Vite, Tailwind CSS | Upload interactions, navigation, forms, report rendering |
| Response validation | Zod | Checks API response structure before use |
| API | Python, FastAPI, Uvicorn | Receives files and requests, returns structured results |
| Data processing | pandas, NumPy, openpyxl | Reads supported tables and calculates summaries |
| ML | scikit-learn | Preprocessing pipelines, fitting, validation, metrics, associations |
| Voice | Browser SpeechSynthesis | Reads available summaries with installed browser voices |
| Tests | Vitest, Testing Library, pytest | Checks frontend/backend behavior |

The browser displays API results; the Python backend trains the ML models. Ordinary local development uses the UI on port 5173 and API on 8000. Data and fitted pipelines are held in bounded in-memory stores, not a persistent project database. Entries expire after an hour from storage and can be evicted when limits are reached; restarting the API loses them. Upload again when a dataset is unavailable.

### 11.2 API story for a technical examiner

```text
POST /dataset/analyze  → upload and analyze, or request target selection
POST /analysis/run     → finish target selection / change validation
POST /predictions      → estimate one input record
POST /explanations     → return a language-template summary for a prediction
GET  /health           → backend availability
```

The UI does not normally ask the user to choose an inferior candidate for a manual prediction. It sends the report configuration and the backend uses the selected candidate. An API caller can explicitly specify one of the supported models, but that is separate from the normal presentation flow.

### 11.3 What “we built” means

If you actually completed these parts, you can describe your contribution as integrating dataset handling, reusable preprocessing, model comparison, validation/reporting and a usable prediction interface. The regression estimators come from scikit-learn. You did not invent Ridge, Lasso, Elastic Net or Random Forest.

**Say:** “Our project work is the application and end-to-end ML workflow around existing regression algorithms.” Describe your own role honestly. This guide explains the current code; it cannot establish who personally authored every part or what tools your course permits.

### 11.4 Claims to avoid

- “R² is our accuracy percentage.”
- “The selected model must be useful.”
- “Random Forest always wins.”
- “This band has guaranteed 95% coverage.”
- “Feature importance tells us how much fertilizer causes yield to increase.”
- “The automated summary is generated by ChatGPT.”
- “The saved demo trains a new model.”
- “All outliers and duplicates are removed.”
- “Leakage checks passed, so leakage is impossible.”
- “National wheat-yield results prove accurate predictions for individual farms.”
- “A model was independently final-tested because its diagnostic holdout looks good.”

### 11.5 Improvements you can propose, not claim as completed

Collect representative farm-level data with verified units and outcome timing; compare stronger domain baselines; reserve independent evaluation; tune parameters within proper validation; measure held-out associations; calibrate uncertainty; improve feature-specific input-range checks; add persistent storage with access controls if moving beyond local use.

## 12. Presentation scripts and demo checklist

### 12.1 A 60-second opening

> “Our project is CropCast, a web application for agricultural tabular analysis and numeric prediction. We upload a dataset, identify the outcome we want to predict, and compare Ridge, Lasso, Elastic Net and Random Forest against a simple training-mean baseline. The candidate with the lowest cross-validated RMSE is selected. The report also shows data-quality warnings, exploratory summaries and model associations. We can then enter one new record and get its estimated target with an RMSE-based error band. The application runs locally, and its reliability depends on the data and validation strategy. The bundled field-trial sample is synthetic, so I use it to demonstrate the workflow, not to claim real-farm accuracy.”

### 12.2 A five-to-seven-minute live demonstration

| Approximate time | Screen/action | Natural speaking cue |
|---|---|---|
| 0:00–0:40 | Home | “The goal is to make a tabular ML comparison understandable and usable in one workflow.” |
| 0:40–1:20 | Start analysis; upload prepared file | “This file has historical inputs and a numeric outcome. I am uploading it for a fresh analysis.” |
| 1:20–1:45 | Overview | “Here is what one row means, the selected target and the retained inputs.” |
| 1:45–2:45 | Compare models | “This is the selected model. Read its actual CV RMSE and the baseline beside it. Lower error is better; R² is not accuracy percent.” |
| 2:45–3:45 | Predict a new record | “I fill a known input profile and ask for one estimate. The target stays locked because it is the unknown answer.” |
| 3:45–4:15 | Testing evidence | “These known historical outcomes let us inspect misses. Positive residual is underprediction; this holdout is diagnostic, not independent final evidence.” |
| 4:15–4:45 | Data quality | “These warnings explain issues that can limit trust, rather than hiding them.” |
| 4:45–5:15 | Exploration | “This shows target coverage, numerical spread and linear associations.” |
| 5:15–5:40 | Preprocessing | “Imputation, encoding and scaling happen within each training fit.” |
| 5:40–6:15 | Model associations | “First check the method. These bars describe fitted associations or reliance, not causes.” |
| 6:15–6:45 | Automated summary; switch language | “The same summary is available in three language templates. Voice depends on installed browser voices.” |
| 6:45–7:00 | Close | “We have a working comparison and prediction workflow. Better real-world evidence needs representative data, independent evaluation and calibrated uncertainty.” |

Training may take longer than this schedule. Finish a rehearsal first; explain the workflow while training, or keep a completed report ready and clearly disclose any saved demo fallback. You do not need to recite all formulas during the click-through; keep them ready for questions.

### 12.3 Exact sample rehearsal: start here if you are unsure

1. Start both servers as shown below and open the local `/analysis` page in ordinary Chrome.
2. Choose **Download sample dataset** below the uploader. This downloads `sample-field-trials.csv`. Alternatively, use the existing file at `C:\2ND YEAR ODD SEM\ML\crop-yield-app\public\sample-datasets\sample-field-trials.csv`.
3. Choose **Browse files**, select that CSV and wait for analysis. Do not choose **Run demo analysis** if you want fresh training and manual prediction.
4. For this bundled sample, `yield_t_ha` is the named target. If a target-selection screen appears for a different file, choose its intended outcome rather than guessing.
5. Check Overview and explain that the sample represents synthetic field-season records. Read the selected model and actual scores in Compare models; this guide does not prescribe a winner or live scores.
6. Open **Predict a new record**, choose **Fill typical inputs** and inspect the values it supplies. This is a concrete reproducible profile derived from your upload, not a profile you must invent. Choose **Predict new record** and read the returned estimate and model.
7. Note the filled `rainfall_mm` value. Increase it by 10 mm only after confirming both values lie within the numerical profile's observed range. Predict again. Compare the two results without promising a direction or a change.
8. Visit the remaining six sidebar items and use section 4's speaking cues. In Model associations, read the method label before interpreting the values.
9. Optionally, return to **Compare models → Validation strategy → Choose the validation split**. Select an available grouped or temporal radio option. Selection automatically starts re-scoring; there is no separate Run button. Wait for the re-scoring status to finish, then confirm the new checked option, active strategy label and updated metrics. Skip disabled options and read their reasons.
10. Switching validation can change the winner and clears the previous manual prediction. Fill the inputs and predict again if needed. The saved demo cannot switch validation.

### 12.4 A safe input-change experiment

1. Use an uploaded report, not saved demo mode.
2. Choose **Fill typical inputs**, predict and note the result.
3. Change one supported input modestly within the observed range.
4. Predict again and compare the two returned estimates.
5. Say: “This shows how this fitted model responds to these inputs. It does not prove the real-world causal effect of the change.”

Do not promise that fertilizer or rainfall always increases the prediction. A forest may give the same value until a learned threshold is crossed; a linear change depends on its learned coefficient; rainfall can have interactions. No change does not automatically mean the button is broken.

Changing new-record inputs should not retrain the comparison or improve the historical CV score. Changing validation re-scores models; uploading new data can change the learned relationships.

### 12.5 Before you stand up

- Open an ordinary Chrome window for the live presentation. Automated testing browsers can intercept native file dialogs; an automated upload is not proof that the Windows picker will open during your demo.
- Start the backend and frontend and verify the actual ports printed by the servers.
- Keep your chosen file accessible; know whether it is synthetic, national or real field-level data.
- Know what one row, your target and its units mean.
- Record the report's selected model, CV RMSE/MAE/R², baseline RMSE and strategy.
- Check whether the baseline warning appears; do not hide it.
- Rehearse one prediction and one modest input change.
- Check voice before relying on it; use the text if no suitable voice is installed.
- Keep a printed report or clearly labelled saved demo fallback.
- Avoid leaving your dataset unused until the in-memory entry expires; upload again if needed.

Start commands for this existing project setup, from its absolute root:

```powershell
# Terminal 1
Set-Location 'C:\2ND YEAR ODD SEM\ML\crop-yield-app'
npm run dev:api

# Terminal 2
Set-Location 'C:\2ND YEAR ODD SEM\ML\crop-yield-app'
npm run dev

# Typical local UI address: http://127.0.0.1:5173/analysis
```

### 12.6 Common demo problems and what to say

| Situation | Honest response / action |
|---|---|
| Several targets offered | “The table has more than one eligible outcome, so I choose the intended one.” |
| File rejected | Check supported type, size, column names and enough numeric labelled rows |
| Prediction asks for fields | Fill the requested feature values, not the target |
| Dataset no longer available | “This local session expired or restarted; I will upload again.” |
| Weak/negative R² or baseline warning | “This is an informative limitation: these inputs have not demonstrated useful predictive skill under this evaluation.” |
| Metric displayed as a dash | “The statistic is missing or undefined, not zero error.” |
| Voice unavailable | “Text is available, but this browser does not have the required voice.” |
| Grouped/temporal unavailable | Read its explanation; do not invent a suitable entity or time axis |
| Saved demo cannot predict | Upload the sample with the API running; saved demo only replays a report |

To describe your live numbers, use this sentence structure rather than memorized sample scores:

> “On this dataset, using this displayed validation strategy, the selected model is the one shown here. Its CV RMSE is the displayed value in the confirmed target units. Compared with the baseline, the report shows this improvement or warning. These results support this evaluation setting, not every farm or future year.”

## 13. Viva questions and answers

**1. What problem does your project solve?**
It combines dataset upload, regression comparison, data inspection and one-record prediction in a web interface. It helps users examine a dataset's predictive usefulness rather than automatically declaring every prediction reliable.

**2. Why four models?**
Three offer different regularization styles for additive linear relationships. The forest provides a nonlinear tree-based comparison. Validation lets us compare these candidates on the same problem.

**3. Which is the best algorithm?**
For this report, the candidate with the smallest CV RMSE under the displayed strategy. There is no universally best algorithm for all datasets.

**4. Why RMSE for selection?**
It is in the target's units and weights larger misses more strongly than MAE. It is the project's declared selection rule; MAE and R² provide additional context. Selection on one metric is not a complete reliability guarantee.

**5. Does low RMSE mean the crop yield is low?**
No. RMSE is prediction error. Predicted yield is the estimated outcome. They are different quantities even when they share units.

**6. Why can R² be negative?**
The model's evaluated squared error exceeds the error from predicting the evaluated targets' mean. That signals poor relative performance for those observations.

**7. Why not just say accuracy?**
This is continuous regression. A category-style percentage of correct outputs is not the defined measure. We report errors and R² instead.

**8. Why does the app need a baseline?**
Without it, a complicated model might look useful even though predicting the mean would be as good or better. CropCast also requires more than a 5% CV RMSE reduction to pass its useful-signal rule.

**9. What is cross-validation?**
Repeated fits on training folds that predict their excluded folds. The app calculates metrics on assembled out-of-fold predictions. Grouped or temporal folds enforce additional boundaries.

**10. Is the displayed holdout independent final evidence?**
No. Its rows overlap the CV used for selection. It is a diagnostic comparison, not a reserved final test untouched by selection.

**11. What are overfitting and underfitting?**
Overfitting is learning training-specific patterns that fail to transfer. Underfitting is missing useful structure. This app's validation helps expose poor transfer, but its standard report does not by itself prove which issue caused every error.

**12. Why median imputation and scaling?**
Median is less sensitive to extreme numeric values than mean. Scaling places numeric inputs on comparable scales for the regularized linear fits. Both are learned in each training fold.

**13. Why one-hot encoding?**
Models need numeric representations. One-hot columns encode category membership without pretending that soil labels have a numeric order.

**14. Does the app remove bad rows?**
Not all flagged rows. Missing targets are excluded from modeling; missing features are imputed. Duplicates and outliers are retained and reported. Constant/identifier-like inputs and detected target-defining pairs are excluded as features.

**15. What does a negative coefficient mean?**
With other transformed inputs fixed, a higher value of that transformed input lowers the linear model's prediction. It is an association, not a causal farming instruction.

**16. What does large Random Forest importance mean?**
Shuffling that feature increases the measured error substantially. It does not say whether increasing the feature increases or decreases yield.

**17. Why is importance small?**
The fitted model may rely little on it, another feature may substitute for it, or its contribution may be weak on these measured rows. Rounding also matters. Small importance is not low crop yield.

**18. If I increase fertilizer, must the estimate increase?**
No. Response depends on the fitted model and the data. Nonlinear models can show thresholds or interactions, and the synthetic generator includes diminishing returns. A predicted response is not evidence for a real intervention.

**19. What does the error band mean?**
An illustrative symmetric range based on CV RMSE, usually estimate ± 1.96 × RMSE. It is not a calibrated 95% prediction interval.

**20. What if an input is missing or a category is new?**
The normal form asks for its inputs. The backend can impute absent features. Unseen categories use unknown-safe encoding and produce a notice, but support for predicting them may be weak.

**21. Is the summary generative AI?**
No. It uses language templates populated with model information. Speech playback is a browser feature. The summary is not a local causal explanation of the entered record.

**22. Where is the database?**
The current local backend uses bounded in-memory stores for datasets, models and prediction summaries. They are not durable across a backend restart.

**23. Is it a future forecast?**
Not automatically. Random splits are not forecast validation. Temporal evaluation tests earlier-to-later behavior, and genuine forecasting also requires inputs available at forecast time.

**24. How can you improve the project?**
Use representative data, better baselines, independent evaluation, correctly nested tuning, held-out attribution and calibrated uncertainty. Add persistence/security for deployment rather than calling the local prototype production-ready.

**25. What did you implement versus reuse?**
The application integrates the workflow and report around existing libraries. The regression algorithms are scikit-learn estimators. Explain only your actual personal contribution; do not claim to have invented those methods.

## 14. One-page revision sheet

- **Problem:** estimate a numeric target from an uploaded historical table.
- **Inputs:** eligible numeric/categorical features known before the outcome.
- **Target:** the unknown answer; never enter it as an input.
- **Models:** Ridge, Lasso, Elastic Net, Random Forest.
- **Selection:** lowest cross-validated RMSE among those four.
- **Baseline:** training-mean prediction; more than 5% RMSE reduction passes the app's margin.
- **MAE:** average absolute error; lower is better.
- **RMSE:** root average squared error; lower is better; target units.
- **R²:** relative squared-error score; not accuracy percent; can be negative.
- **Residual:** actual − predicted; positive = underprediction.
- **Preprocessing:** median, mode, one-hot encoding, standard scaling in training fits.
- **Validation:** random = mixed rows; grouped = unseen entities; temporal = later periods.
- **Testing chart:** historical diagnostic holdout, not independent final testing.
- **Typical-input example:** prediction for medians/modes, not dataset mean.
- **Coefficient:** fitted direction for transformed linear input.
- **Permutation importance:** RMSE change after shuffling; no effect direction.
- **Association:** not proof of causation or a local explanation.
- **Band:** estimate ± 1.96 × CV RMSE; not guaranteed 95% coverage.
- **Summary:** English/Hindi/Telugu templates; browser voice when available.
- **Demo:** saved report; upload sample for actual training/manual prediction.
- **Scope:** local exploratory course project; synthetic demo is not field validation.

## 15. Prompt to give ChatGPT

Upload this file in a new ChatGPT conversation. If you want help explaining your exact scores, also upload readable screenshots of Compare models, the prediction result and Model associations. The sidebar screenshot alone does not contain those numbers.

Copy this message:

```text
I am presenting the CropCast project described in the attached PRESENTATION_README.md.
I am a beginner and need to understand it, not just memorize technical words.

Use the attached guide as the source of truth for the implementation.
Separate project facts from general ML explanations and proposed improvements.
Do not invent my personal contribution, dataset provenance, scores or features.
If my result screenshots are missing, ask for them instead of guessing values.

Teach me in this order:
1. Explain the entire application in simple English using one input/output example.
2. Explain each of the nine sidebar sections and what I should say while showing it.
3. Explain Ridge, Lasso, Elastic Net and Random Forest with everyday analogies,
   then the actual formulas and fixed settings in the guide.
4. Calculate MAE, RMSE, R-squared, residuals and the error band step by step.
5. Explain what low, high, zero and negative values mean for each displayed quantity.
6. Distinguish coefficients, permutation importance, correlation and predicted yield.
7. Help me interpret my actual screenshots, including units and validation caveats.
8. Create a natural five-minute presentation script and a one-minute version.
9. Act as an examiner: ask one viva question at a time, wait for my answer,
   correct it kindly, then ask the next question.

Keep these distinctions intact:
- R-squared is not accuracy percent.
- Selected does not automatically mean useful.
- An RMSE-based band is not guaranteed 95% coverage.
- Association is not causation or a local explanation of the new record.
- Saved demo is not fresh training; synthetic data do not prove real-farm accuracy.
- The summary uses templates, not a generative AI service.
- The diagnostic holdout is not an untouched final test.
- The separate national-wheat benchmark is not the ordinary UI validation protocol.

Start with the simplest explanation. Ask one short comprehension question
before moving on. Use short sentences, define unfamiliar terms, and help me
answer honestly rather than making exaggerated project claims.
```

Optional follow-up: “Explain this in Telugu first, but keep the final presentation script in simple English.”

## 16. Implementation map and reference notes

### Local implementation sources

All paths below are absolute paths in the current project. The presentation guide was checked against these files; local code determines what CropCast does.

| Source file | What it establishes |
|---|---|
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\backend\app\analysis.py` | Upload parsing, targets/features, preprocessing, estimators, splits, metrics, associations, quality checks, report templates |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\backend\app\main.py` | API endpoints, in-memory storage, prediction and error-band behavior |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\src\components\analysis\AnalysisNavigation.tsx` | Nine sidebar labels |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\src\components\analysis\AnalysisDashboard.tsx` | Report sections, chart scaling, evidence preview/export, form workflow |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\src\components\prediction\PredictionForm.tsx` | Locked target/features and dynamic input types |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\src\components\prediction\PredictionResult.tsx` | Returned prediction, model, band and notices |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\src\components\voice\VoiceControls.tsx` | Language voice selection and playback controls |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\backend\scripts\generate_sample_dataset.py` | Synthetic sample provenance and generation equations |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\docs\real-data-benchmark.md` | Stored independent benchmark protocol, metrics and limitations |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\public\sample-datasets\real-wheat-yields.metadata.json` | Real snapshot attribution, dates and measurement level |
| `C:\2ND YEAR ODD SEM\ML\crop-yield-app\package.json` | Actual frontend libraries and run/test scripts |

The existing developer/setup README is `C:\2ND YEAR ODD SEM\ML\crop-yield-app\README.md`. This presentation guide supplements it; it is not a replacement setup document.

### Official background documentation

The references below were checked for the general metric/model definitions. They do not supply CropCast's dataset-specific results. S1–S9 markers above refer to these source titles; URLs are kept in code so they can be copied independently.

```text
S1 Regression metrics: scikit-learn model evaluation guide
https://scikit-learn.org/stable/modules/model_evaluation.html#regression-metrics
S2 Linear prediction equation: scikit-learn linear models guide
https://scikit-learn.org/stable/modules/linear_model.html
S3 Ridge objective and alpha
https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html
S4 Lasso objective
https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Lasso.html
S5 Elastic Net objective and l1_ratio
https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.ElasticNet.html
S6 RandomForestRegressor behavior and defaults
https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestRegressor.html
S7 StandardScaler transformation
https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html
S8 permutation_importance measurement
https://scikit-learn.org/stable/modules/generated/sklearn.inspection.permutation_importance.html
S9 Permutation interpretation, held-out measurement and correlated features
https://scikit-learn.org/stable/modules/permutation_importance.html
```

If the implementation changes, review this guide before presenting it. A passing software test confirms behavior within the test's scope; it does not establish agricultural validity or future forecasting performance.