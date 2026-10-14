// Run with an installed Playwright module and local API/frontend servers.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true, timeout: 30000,
  })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(120000)
    const errors = []
    const payloads = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', async (response) => {
      if (response.url().includes(':8000/') && response.request().method() === 'POST') {
        payloads.push({ url: response.url(), status: response.status(), body: await response.json() })
      }
    })
    const base = process.env.WEB_URL || 'http://127.0.0.1:5173'
    await page.goto(`${base}/analysis`)
    await page.waitForLoadState('networkidle')
    console.log('Upload page loaded')

    // Unknown units and constant columns previously broke real browser/API integration.
    const lines = ['rainfall,constant,year,production']
    for (let i = 0; i < 24; i++) lines.push(`${300 + i * 30},1,${2015 + Math.floor(i / 4)},${(20 + i * 1.3 + (i % 3) * 2.1).toFixed(2)}`)
    await page.getByLabel('Choose dataset file').setInputFiles({
      name: 'smoke-production.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')),
    })
    await page.getByText('Analysis complete', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('constant', { exact: true }).count(), 0)
    await page.getByLabel('rainfall', { exact: true }).fill('650')
    await page.getByLabel('year', { exact: true }).fill('2019')
    await page.getByRole('button', { name: 'Predict this field', exact: true }).click()
    await page.getByRole('heading', { name: 'Prediction result', exact: true }).waitFor()
    await page.getByRole('button', { name: /Show model summary|Explain result/ }).click()
    await page.locator('.explanation-panel p').waitFor()
    console.log('Unknown-unit report, field prediction and model summary passed')

    await page.getByLabel('rainfall', { exact: true }).fill('700')
    assert.equal(await page.getByRole('heading', { name: 'Prediction result', exact: true }).count(), 0)
    const temporal = page.locator('input[name="validation-strategy"][value="temporal"]')
    if (await temporal.count()) {
      await temporal.click()
      await page.waitForFunction(() => !document.querySelector('.validation-picker fieldset').disabled)
      assert.ok(await temporal.isChecked())
      assert.equal(await page.getByLabel('rainfall', { exact: true }).inputValue(), '700')
    }
    await page.screenshot({ path: path.join(process.cwd(), '.tmp-revival-report.png'), fullPage: true })
    fs.writeFileSync('.tmp-revival-api-responses.json', JSON.stringify(payloads, null, 2))
    assert.ok(payloads.length >= 3)
    assert.ok(payloads.every((response) => response.status === 200), JSON.stringify(payloads))
    assert.deepEqual(errors, [])
    console.log('Input invalidation, response status and browser error checks passed')

    await page.getByRole('button', { name: 'Upload another dataset' }).click()
    await page.getByRole('button', { name: 'Run demo analysis' }).click()
    await page.getByText('Demo analysis', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Predict this field', exact: true }).count(), 0)
    console.log('Recovery and static-demo checks passed')
  } finally {
    await browser.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })