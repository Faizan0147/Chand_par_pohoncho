import { useState } from 'react'
import { loadOptional } from '../lib/data.jsx'
import './BriefButton.css'

/** "Download Site Brief (PDF)": one page with the scenario, verdict, stats and slip tolerance shown on the page. */
export default function BriefButton(props) {
  const [state, setState] = useState('idle') // idle | busy | error
  const click = async () => {
    setState('busy')
    try {
      const [{ downloadBrief }, validation] = await Promise.all([import('../lib/brief.js'), loadOptional('validation')])
      await downloadBrief({ ...props, validation, url: window.location.href })
      setState('idle')
    } catch (e) {
      console.warn('Site brief failed:', e)
      setState('error')
    }
  }
  return (
    <span className="brief">
      <button type="button" className="btn" onClick={click} disabled={state === 'busy'} aria-busy={state === 'busy'}>
        {state === 'busy' ? 'Preparing PDF…' : 'Download brief (PDF)'}
      </button>
      {state === 'error' && <span className="brief-err small" role="alert">Could not create the PDF. Try again.</span>}
    </span>
  )
}
