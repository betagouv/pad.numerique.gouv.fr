/**
 * SpellChecker module for CodeMirror
 *
 * This module defines a SpellChecker class responsible for adding spell-checking functionality
 * to CodeMirror instances. It overlays a spell-checking mechanism onto the CodeMirror editor,
 * highlighting misspelled words and providing suggestions.
 *
 * This code is adapted from the Codemirror Spell Checker plugin by Sparksuite, available at:
 * https://github.com/sparksuite/codemirror-spell-checker/blob/master/src/js/spell-checker.js
 */

import {
  debug,
  serverurl
} from '../config'

import '../../../css/spell-checker.css'
import config from '../editor/config'

// SpellChecker configurations
const SPELLING_ERRORS_TYPES = ['misspelling']
const BASE_STYLE_CSS_CLASS = 'spell-check'
const EDITOR_LINE_HEIGHT = 22.5
const MIN_LOADING_TIME = 500
export const DELETE_DOUBLE_SPACE_VALUE = 'Supprimer les doubles espaces'

export function SpellChecker (mode, codeMirrorInstance) {
  if (typeof codeMirrorInstance !== 'function' || typeof codeMirrorInstance.defineMode !== 'function') {
    console.log('CodeMirror Spell Checker: You must provide an instance of CodeMirror via the option `codeMirrorInstance`')
    return
  }

  codeMirrorInstance.defineMode(mode, function (config) {
    const overlay = {
      token: function (stream, state) {
        if (stream.sol()) {
          state.lineCount++
          state.charCount = 0
        }

        if (!SpellChecker.data || !SpellChecker.data.matches) {
          stream.next()
          state.charCount++
          return null
        }

        const match = SpellChecker.data.matches.find(
          (item) => item.position.line + 1 === state.lineCount && item.position.ch === state.charCount
        )

        if (!match) {
          stream.next()
          state.charCount++
          return null
        }

        state.match = match

        for (let step = 0; step < match.length; step++) {
          stream.next()
          state.charCount++
        }

        // The spell checker runs and detects errors, but in headless mode, it does not add error or warning styles.
        // This means users won't see errors or warnings and won't be able to click on them to open the overlay.
        if (SpellChecker.featureFlag === SpellCheckerFeatureFlags.HEADLESS) {
          return
        }

        if (match.rule && match.rule.issueType && SPELLING_ERRORS_TYPES.includes(match.rule.issueType)) {
          return `${BASE_STYLE_CSS_CLASS}-error`
        }

        return `${BASE_STYLE_CSS_CLASS}-warning`
      },
      startState: function () {
        return { lineCount: 0, charCount: 0, match: null }
      },
      blankLine: function (state) {
        state.lineCount++
      }
    }

    const mode = codeMirrorInstance.getMode(
      config, config.backdrop || 'text/plain'
    )

    return codeMirrorInstance.overlayMode(mode, overlay, true)
  })
}

SpellChecker.data = null
SpellChecker._overlay = null
SpellChecker._status = null
SpellChecker._loadingStartTime = null
SpellChecker._openMatch = null
SpellChecker.currentRequest = null

/**
 * Fetches data from the LanguageTool HTTP server via the specified endpoint
 * to check the content of the editor.
 *
 * @param {object} editor - The CodeMirror editor instance.
 */
SpellChecker.fetchData = (editor) => {
  SpellChecker.initStatus()
  SpellChecker.startSpinner()

  SpellChecker.currentRequest = $.post(`${serverurl}/check/`, {
    text: editor.getValue(),
    language: 'auto',
    motherTongue: 'fr'
  })
    .done(data => {
      // LanguageTool returns an offset, but CodeMirror needs a line and character position
      data.matches = data.matches.map((match) => {
        // Convert global offset to line and character position
        return Object.assign({}, match, {
          position: editor.posFromIndex(match.offset)
        })
      })
      if (debug) {
        console.debug(data)
      }
      SpellChecker.data = data
      SpellChecker.render(editor)
      SpellChecker.stopSpinner()
      SpellChecker.updateStatus(data.matches)
    })
    .fail((err) => {
      if (debug) {
        console.debug(err)
      }
      SpellChecker.stopSpinner()
      if (err.statusText !== 'abort') {
        SpellChecker.updateStatus(null, true)
      }
    })
}

SpellChecker.render = (editor) => {
  editor.setOption('mode', config.spellCheckerMode)
}

SpellChecker.hasError = (token) => {
  return token && token.state && token.state.overlayCur && token.state.overlayCur.includes(BASE_STYLE_CSS_CLASS)
}

SpellChecker.positionOverlay = (cursorPosition, overlay) => {
  const bottomSpace = window.innerHeight - cursorPosition.bottom
  const rightSpace = window.innerWidth - cursorPosition.right

  // By default, the overlay is positioned at the bottom-right of the cursor
  let top = cursorPosition.top
  let left = cursorPosition.left

  // If there is limited space at the bottom, position the overlay on the top
  if (bottomSpace < overlay.offsetHeight) {
    // Determined empirically based on practical testing and adjustments
    top -= overlay.offsetHeight + EDITOR_LINE_HEIGHT * 0.5
  } else {
    // Determined empirically based on practical testing and adjustments
    top += EDITOR_LINE_HEIGHT + EDITOR_LINE_HEIGHT * 0.3
  }

  // If there is limited space at the right, position the overlay on the left side
  if (rightSpace < overlay.offsetWidth) {
    left -= overlay.offsetWidth - rightSpace
  }

  overlay.style.left = `${left}px`
  overlay.style.top = `${top}px`
}

/**
 * This function uses the close icon from Bootstrap.
 * @see {@link https://icons.getbootstrap.com/icons/x/}
 * @returns {string} HTML string for the close button.
 */
SpellChecker.createHtmlCloseButton = () => {
  return `
    <button id="close-overlay" type="button">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
      </svg>
    </button>
  `
}

SpellChecker.createHtmlContent = (match) => {
  const shortMessage = match.shortMessage
  const ruleName = match.rule && match.rule.category && match.rule.category.name
  const subtitle = shortMessage || ruleName

  let html = ''

  // Add a sub-title if available, ex: 'Faute de frappe'
  if (subtitle) {
    html += `<p class='subtitle'>${subtitle}</p>`
  }

  // Add a descriptive message about the match
  html += `<p class='message'>${match.message}</p>`

  // Add suggestions to fix the match, if available
  if (match.replacements && match.replacements.length > 0) {
    html += '<ul>'
    match.replacements.slice(0, process.env.SPELL_CHECKER_MAXIMUM_NUMBER_OF_REPLACEMENTS).forEach((replacement) => {
      const value = replacement.value === ' ' ? DELETE_DOUBLE_SPACE_VALUE : replacement.value
      html += `<li>${value}</li>`
    })
    html += '</ul>'
  }

  return html
}

/**
 * Open an overlay to display information about the selected match.
 *
 * @param {object} match - The match object containing details about the detected issue.
 * @param {object} position - The position object specifying where to open the overlay.
 */
SpellChecker.openOverlay = (match, position, onReplacementSelection) => {
  SpellChecker.closeOverlay()

  // Create the overlay element
  const overlay = document.createElement('div')
  overlay.className = 'spell-check-overlay'

  // Build and set the HTML content of the overlay
  overlay.innerHTML = `
    <div>
        <div class='header'>
          <p class='title'>Correction</p>
          ${SpellChecker.createHtmlCloseButton()}
        </div>
        <div class='content'>
           ${SpellChecker.createHtmlContent(match)}
        </div>
    </div>
  `

  // Handle click interactions on suggestions
  // FIXME: Should be improved ASAP, only work with a mouse.
  overlay.addEventListener('click', function (event) {
    if (event.target.tagName === 'LI') {
      onReplacementSelection(event.target.textContent)
      SpellChecker.closeOverlay()
    }
  })

  // Store the overlay and the open match in SpellChecker for later reference
  SpellChecker._overlay = overlay
  SpellChecker._openMatch = match

  // Hide the overlay to measure its size accurately while positioning
  // The overlay needs to be part of the DOM.
  overlay.style.visibility = 'hidden'
  document.body.appendChild(overlay)

  SpellChecker.positionOverlay(position, overlay)

  // Make it visible after positioning
  overlay.style.visibility = 'visible'

  // Handle click interactions on close button
  const closeButton = document.getElementById('close-overlay')
  closeButton.addEventListener('click', function (event) {
    SpellChecker.closeOverlay()
  })
}

SpellChecker.closeOverlay = () => {
  // Get the current overlay
  const overlay = SpellChecker._overlay

  // Close the overlay if open
  if (overlay) {
    overlay.parentNode.removeChild(overlay)
    // Clear SpellChecker's state
    SpellChecker._overlay = null
    SpellChecker._openMatch = null
  }
}

SpellChecker.closeStatus = () => {
  // Get the current status
  const status = SpellChecker._status

  // Close the status if open
  if (status) {
    status.parentNode.removeChild(status)
    // Clear SpellChecker's state
    SpellChecker._status = null
  }
}

SpellChecker.reset = () => {
  // Close the overlay if open
  SpellChecker.closeOverlay()

  // Close the status if open
  SpellChecker.closeStatus()

  // Reset SpellChecker's state
  SpellChecker.data = null
  SpellChecker._overlay = null
  SpellChecker._status = null
  SpellChecker._openMatch = null
}

SpellChecker.abortFetchData = () => {
  if (!SpellChecker.currentRequest) {
    return
  }
  SpellChecker.currentRequest.abort()
  SpellChecker.currentRequest = null
}

SpellChecker.updateMatchIndexes = (change) => {
  SpellChecker.data.matches = SpellChecker.data.matches.map((match) => {
    const isOnSameLine = change.from.line === change.to.line && change.from.line === match.position.line
    const isInsertedBeforeMatch = change.from.ch < match.position.ch
    const isSingleInsertion = change.text.length === 1 && change.removed.length === 1

    // If characters are inserted/removed on the same line as the match, before
    if (isOnSameLine && isInsertedBeforeMatch && isSingleInsertion) {
      const numberCharactersInserted = change.text[0].length - change.removed[0].length
      match.position.ch += numberCharactersInserted
      match.offset = editor.indexFromPos(match.position)
      return match
    }

    const lineAddition = change.text.length > change.removed.length
    const numberLinesAdded = change.text.length - change.removed.length

    // If line are inserted on the same line as the match, before
    if (lineAddition && isOnSameLine && change.from.ch === change.to.ch && isInsertedBeforeMatch) {
      match.position.line += numberLinesAdded
      match.position.ch -= change.to.ch
      match.offset = editor.indexFromPos(match.position)
      return match
    }

    // If line are inserted before the line of the match
    if (lineAddition && change.to.line < match.position.line) {
      match.position.line += numberLinesAdded
      match.offset = editor.indexFromPos(match.position)
      return match
    }

    const lineRemoval = change.text.length < change.removed.length
    const numberRemovedLines = change.removed.length - change.text.length

    // If line are removed on the same line as the match, before
    if (lineRemoval && change.to.line === match.position.line) {
      match.position.line -= numberRemovedLines
      match.position.ch += change.from.ch
      match.offset = editor.indexFromPos(match.position)
      return match
    }

    // If line are removed before the line of the match
    if (lineRemoval && change.to.line < match.position.line) {
      match.position.line -= numberRemovedLines
      match.offset = editor.indexFromPos(match.position)
      return match
    }

    return match
  })
}

SpellChecker.updateStatus = (matches, networkError = false) => {
  const status = document.querySelector('.spell-check-status')

  if (!status) {
    return
  }

  const checkIcon = status.querySelector('#status-check-icon')
  const networkErrorIcon = status.querySelector('#status-network-error-icon')
  const errorsCount = status.querySelector('#status-errors-count')
  const infinityIcon = status.querySelector('#status-infinity-icon')

  if (networkError) {
    status.classList.add('error')

    // Display the network error icon and hide others
    networkErrorIcon.style.display = 'block'
    infinityIcon.style.display = 'none'
    errorsCount.style.display = 'none'
    checkIcon.style.display = 'none'

    return
  } else {
    // Hide the network error icon
    networkErrorIcon.style.display = 'none'
  }

  if (matches && matches.length) {
    const hasMoreThanTwoDigits = matches.length < 100
    if (hasMoreThanTwoDigits) {
      // Display the errors count and hide others
      errorsCount.textContent = matches.length
      infinityIcon.style.display = 'none'
      errorsCount.style.display = 'block'
    } else {
      // Display the infinity icon and hide others
      infinityIcon.style.display = 'block'
      errorsCount.style.display = 'none'
    }
    status.classList.add('error')
    checkIcon.style.display = 'none'
  } else {
    // Display the check icon and hide others
    checkIcon.style.display = 'block'
    errorsCount.textContent = ''
    status.classList.remove('error')
    errorsCount.style.display = 'none'
    infinityIcon.style.display = 'none'
  }
}

SpellChecker.startSpinner = () => {
  const status = document.querySelector('.spell-check-status')
  if (!status) {
    return
  }
  status.classList.add('loading')
  SpellChecker._loadingStartTime = Date.now()
}

SpellChecker.stopSpinner = () => {
  const status = document.querySelector('.spell-check-status')
  if (!status) {
    return
  }
  // Ensures the loading spinner is displayed for a minimum duration (MIN_LOADING_TIME)
  // to prevent flickering and provide a consistent user experience.
  let remainingTime = 0
  if (SpellChecker._loadingStartTime) {
    const timeElapsed = Date.now() - SpellChecker._loadingStartTime
    remainingTime = MIN_LOADING_TIME - timeElapsed
  }
  setTimeout(() => {
    status.classList.remove('loading')
    SpellChecker._loadingStartTime = null
  }, Math.min(remainingTime, 0))
}

SpellChecker.initStatus = () => {
  // If the status element is already initialized, return early to avoid duplication
  if (SpellChecker._status) {
    return
  }

  // Only display visual elements if the feature is enabled
  if (SpellChecker.featureFlag !== SpellCheckerFeatureFlags.ENABLED) {
    return
  }

  const status = document.createElement('div')
  status.className = 'spell-check-status'

  const codeMirrorEditor = document.querySelector('.CodeMirror')

  SpellChecker._status = status

  /**
   * Network error icon from bootstrap (displayed when network requests are failing).
   * @see {@link https://icons.getbootstrap.com/icons/x/}
   */
  const errorIcon = `
    <svg id="status-network-error-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
      <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
    </svg>
  `
  /**
   * Check icon from bootstrap, displayed by default.
   * @see {@link https://icons.getbootstrap.com/icons/check/}
   */
  const checkIcon = `
    <svg id="status-check-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
      <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425z"/>
    </svg>
  `
  /**
   * Infinity icon from bootstrap (displayed when the number of errors has more than 2 digits).
   * @see {@link https://icons.getbootstrap.com/icons/infinity/}
   */
  const infinityIcon = `
    <svg id="status-infinity-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
      <path d="M5.68 5.792 7.345 7.75 5.681 9.708a2.75 2.75 0 1 1 0-3.916ZM8 6.978 6.416 5.113l-.014-.015a3.75 3.75 0 1 0 0 5.304l.014-.015L8 8.522l1.584 1.865.014.015a3.75 3.75 0 1 0 0-5.304l-.014.015zm.656.772 1.663-1.958a2.75 2.75 0 1 1 0 3.916z"/>
    </svg>
  `
  // Build and set the HTML content of the status element
  // The status element is responsible for showing the current document state, the number of spell or grammar errors,
  // network errors, and the loading spinner while fetching data
  status.innerHTML = `
    <div>
      ${checkIcon}
      ${infinityIcon}
      ${errorIcon}
      <div id="status-errors-count"></div>
    </div>
  `

  codeMirrorEditor.appendChild(status)
}

/**
 * The CodeMirror "blur" event cannot reliably close the overlay because it triggers even when clicking on the overlay
 * itself, leading to unintended closure. Furthermore, it lacks information about the click target, it always set to the
 * hidden text area, making it impossible to discern if the click occurred within the overlay or elsewhere.
 */
document.addEventListener('click', function (event) {
  const overlay = document.getElementsByClassName('spell-check-overlay')[0]
  const editor = document.getElementsByClassName('CodeMirror')[0]

  // Check if the click is within the overlay or editor
  if ((overlay && overlay.contains(event.target)) || (editor && editor.contains(event.target))) {
    return
  }

  // Close the spell checker overlay if the click is outside both
  SpellChecker.closeOverlay()
})

/**
 * Feature flags for controlling the SpellChecker feature.
 *
 * This object defines the states in which the spell checker can operate:
 * - ENABLED: Fully operational.
 * - DISABLED: Completely disabled.
 * - HEADLESS: Operates without a UI, useful for testing or backend processing.
 *
 * `SpellChecker.featureFlag` is set based on the `SPELL_CHECKER_FEATURE_FLAG`
 * environment variable. If the variable is not set to a valid flag, the feature
 * defaults to DISABLED. It's a good **Risk Mitigation**, we can quickly disable
 * the feature if issues arise.
 */

export const SpellCheckerFeatureFlags = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  HEADLESS: 'headless'
}

SpellChecker.featureFlag = process.env.SPELL_CHECKER_FEATURE_FLAG

if (!Object.values(SpellCheckerFeatureFlags).includes(SpellChecker.featureFlag)) {
  SpellChecker.featureFlag = SpellCheckerFeatureFlags.DISABLED
}
