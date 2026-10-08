import { useState } from 'react'
import type { TranslationService } from '../services/translationService'
import { getTranslationService } from '../services/translationService'
import { useLoad } from '../hooks/useLoad'
import { parseTranslationFile } from '../utils/translationFile'
import { readTranslationZip } from '../utils/translationZip'
import { languageLabel } from '../utils/languages'
import { Btn, Select } from './ui'
import { S } from '../strings'
import { TempSolutionsPanel } from './TempSolutionsPanel'

const loadChecks = (svc: TranslationService) => svc.checkSetup()
const listSolutions = (svc: TranslationService) => svc.listSolutions()

interface Probe {
  route: string
  bytes: number
  languages: string[]
  base: string
  rows: number
  sheets: string[]
  single: boolean
}

/** What the environment provides — the first stop after deploying into a new environment. */
export function SetupView() {
  const checks = useLoad('setup', loadChecks)
  const solutions = useLoad('solutions', listSolutions)
  const [solution, setSolution] = useState('')
  const [probe, setProbe] = useState<Probe | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const unmanaged = (solutions.data ?? []).filter((s) => !s.isManaged)
  const chosen = solution || unmanaged[0]?.uniqueName || ''

  const runProbe = async () => {
    setProbing(true)
    setProbe(null)
    setProbeError(null)
    try {
      const svc = await getTranslationService()
      const [res, base] = await Promise.all([svc.exportTranslations(chosen), svc.baseLanguage()])
      const file = parseTranslationFile(await readTranslationZip(res.zip), base ? { baseLanguage: base } : {})
      setProbe({
        route: S.setup.routes[res.route] ?? res.route,
        bytes: res.zip.length,
        languages: file.languages.map(languageLabel),
        base: languageLabel(file.baseLanguage),
        rows: file.rows.length,
        sheets: file.sheets.map((s) => s.name),
        single: file.languages.length < 2,
      })
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : String(err))
    } finally {
      setProbing(false)
    }
  }

  return (
    <section className="page">
      <header className="page__header page__header--row">
        <div>
          <h1>{S.setup.title}</h1>
          <p className="muted small">{S.setup.intro}</p>
        </div>
        <Btn onClick={checks.reload} disabled={checks.loading}>
          {S.setup.recheck}
        </Btn>
      </header>
      {checks.error ? <div className="notice notice--error">{checks.error}</div> : null}
      {checks.loading && !checks.data ? <div className="loading">{S.setup.checking}</div> : null}
      <ul className="checks">
        {(checks.data ?? []).map((c) => (
          <li key={c.id} className={`check ${c.ok === true ? 'check--ok' : c.ok === false ? 'check--fail' : 'check--info'}`}>
            <span className="check__icon" aria-hidden>
              {c.ok === true ? '✓' : c.ok === false ? '✕' : 'i'}
            </span>
            <span className="check__label">{c.label}</span>
            <span className="check__detail">{c.detail}</span>
          </li>
        ))}
      </ul>

      <TempSolutionsPanel mode="setup" />

      <h2>{S.setup.probeTitle}</h2>
      <p className="muted small">{S.setup.probeIntro}</p>
      <div className="toolbar">
        <div className="probe__select">
          <Select
            value={chosen}
            options={unmanaged.map((s) => ({ value: s.uniqueName, label: `${s.friendlyName} (${s.uniqueName})` }))}
            onChange={setSolution}
            placeholder={S.scope.solutionPlaceholder}
            aria-label={S.scope.solution}
          />
        </div>
        <Btn kind="primary" onClick={() => void runProbe()} disabled={!chosen || probing}>
          {probing ? S.scope.loadingExport : S.setup.probeRun}
        </Btn>
      </div>
      {probeError ? <div className="notice notice--error">{probeError}</div> : null}
      {probe ? (
        <>
          <ul className="checks">
            <li className="check check--ok">
              <span className="check__icon">✓</span>
              <span className="check__label">{S.setup.probeRoute}</span>
              <span className="check__detail">{probe.route}</span>
            </li>
            <li className="check check--ok">
              <span className="check__icon">✓</span>
              <span className="check__label">{S.setup.probeSize}</span>
              <span className="check__detail">{(probe.bytes / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} KB (Zip)</span>
            </li>
            <li className={`check ${probe.single ? 'check--info' : 'check--ok'}`}>
              <span className="check__icon">{probe.single ? 'i' : '✓'}</span>
              <span className="check__label">{S.setup.probeLanguages}</span>
              <span className="check__detail">
                {probe.languages.join(', ')} — Basis {probe.base}
              </span>
            </li>
            <li className="check check--ok">
              <span className="check__icon">✓</span>
              <span className="check__label">{S.setup.probeRows}</span>
              <span className="check__detail">
                {probe.rows.toLocaleString('de-DE')} ({S.setup.probeSheets}: {probe.sheets.join(', ')})
              </span>
            </li>
          </ul>
          {probe.single ? <div className="notice notice--warn">{S.scope.singleLanguage}</div> : null}
        </>
      ) : null}
    </section>
  )
}
