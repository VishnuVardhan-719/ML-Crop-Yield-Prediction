import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('CropCast routes', () => {
  it('navigates from the landing page into automated analysis', async () => {
    window.history.pushState({}, '', '/')
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /drop your agricultural data/i })).toBeTruthy()
    await user.click(within(screen.getByRole('navigation', { name: 'Primary navigation' })).getByRole('link', { name: 'Analysis' }))
    expect(await screen.findByRole('heading', { level: 1, name: /automated agricultural analysis/i })).toBeTruthy()
    expect(window.location.pathname).toBe('/analysis')
  })

  it('runs the isolated demo automatically into a complete analysis report', async () => {
    window.history.pushState({}, '', '/')
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Run demo analysis' }))
    expect(await screen.findByText('Demo analysis')).toBeTruthy()
    expect(window.location.pathname).toBe('/analysis')
    expect(screen.getByRole('heading', { name: 'Dataset overview' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Data quality' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Exploratory analysis' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Categorical profile' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Preprocessing' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Model performance' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Best performing model' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Prediction' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'AI explanation' })).toBeTruthy()
    expect(screen.getByRole('row', { name: /Ridge/ })).toBeTruthy()
    expect(screen.getByRole('row', { name: /Lasso/ })).toBeTruthy()
    expect(screen.getByRole('row', { name: /Elastic Net/ })).toBeTruthy()
  }, 15000)

  it('redirects the legacy prediction route to analysis', async () => {
    window.history.pushState({}, '', '/predict')
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /automated agricultural analysis/i })).toBeTruthy()
    expect(window.location.pathname).toBe('/analysis')
  })
})
