/**
 * The bundle's entry point. Never executed by Node — esbuild reads it as the
 * entry file and the payload arrives through the virtual `render:source`
 * module, so this is the only place that knows how a generated app is mounted.
 */
import { Component, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from 'render:source'

const root = document.getElementById('root')

/**
 * React swallows render errors into an unmount unless a boundary catches them,
 * which would leave the frame blank with nothing in the console for the host
 * to relay. The panel is the only failure signal a sandboxed frame produces.
 */
class Boundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    window.__renderFail('Render error', error)
  }

  render() {
    return this.state.error ? null : this.props.children
  }
}

/**
 * Makes `<form onSubmit>` work inside `sandbox="allow-scripts"`.
 *
 * Without `allow-forms` the browser blocks the form submission algorithm
 * *before* it fires the submit event, so React's handler never runs and the
 * form appears dead — a generated app with a search box does nothing at all.
 *
 * The click's default action is cancelled and the event dispatched here
 * instead. Nothing is lost by never submitting for real: the document is
 * served under `form-action 'none'` and has no origin to post to, so a real
 * submission could only ever have been a blocked navigation.
 */
const installFormShim = () => {
  const submitOwner = (element) =>
    element?.form ?? element?.closest?.('form') ?? null

  const isSubmitControl = (element) =>
    (element?.tagName === 'BUTTON' && (element.type || 'submit') === 'submit') ||
    (element?.tagName === 'INPUT' && ['submit', 'image'].includes(element.type))

  const submit = (form, submitter) => {
    form.dispatchEvent(
      new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter })
    )
  }

  // Bubble phase, so a control's own onClick has already run by now.
  document.addEventListener('click', (event) => {
    const control = event.target.closest?.('button, input')
    if (event.defaultPrevented || !isSubmitControl(control)) return

    const form = submitOwner(control)
    if (!form) return

    event.preventDefault()
    submit(form, control)
  })

  // Implicit submission — Enter in a single-line field — is blocked the same way.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return

    const field = event.target
    if (field?.tagName !== 'INPUT' || field.type === 'checkbox') return

    const form = submitOwner(field)
    if (!form) return

    event.preventDefault()
    submit(form, form.querySelector('button:not([type=button]), [type=submit]'))
  })
}

/**
 * The host sizes the frame from outside, where the content height is not
 * observable. Reported on every layout change rather than once at mount, so a
 * frame that grows when a list expands does not clip.
 */
const reportHeight = () => {
  let last = -1

  const send = () => {
    const height = Math.ceil(
      document.documentElement.getBoundingClientRect().height
    )
    if (height === last) return

    last = height
    parent.postMessage({ type: 'render:height', height }, '*')
  }

  new ResizeObserver(send).observe(document.documentElement)
  send()
}

try {
  if (typeof App !== 'function') {
    throw new TypeError('The payload must default-export a React component.')
  }

  createRoot(root).render(
    createElement(StrictMode, null, createElement(Boundary, null, createElement(App)))
  )

  installFormShim()
  reportHeight()
  parent.postMessage({ type: 'render:ready' }, '*')
} catch (error) {
  window.__renderFail('Mount failed', error)
}
