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
  serverurl,
} from '../config'

import '../../../css/spell-checker.css'
import config from '../editor/config';

// SpellChecker configurations
const SPELLING_ERRORS_TYPES = ["misspelling"]
const MAXIMUM_NUMBER_OF_REPLACEMENTS = 5;
const BASE_STYLE_CSS_CLASS = "spell-check";
export const TYPING_TIMEOUT_DURATION = 500;
export const DELETE_DOUBLE_SPACE_VALUE = "Supprimer les doubles espaces"

export function SpellChecker(mode, codeMirrorInstance) {

  if(typeof codeMirrorInstance !== "function" || typeof codeMirrorInstance.defineMode !== "function") {
    console.log("CodeMirror Spell Checker: You must provide an instance of CodeMirror via the option `codeMirrorInstance`");
    return;
  }

  codeMirrorInstance.defineMode(mode, function(config) {

    let overlay = {
      token: function(stream, state) {
        if (stream.sol()) {
          state.lineCount++;
          state.charCount = 0;
        }

        if (!SpellChecker.data || !SpellChecker.data.matches) {
          stream.next();
          state.charCount++;
          return null;
        }

        const match = SpellChecker.data.matches.find(
          (item) => item.position.line + 1 === state.lineCount && item.position.ch === state.charCount
        );

        if(!match) {
          stream.next();
          state.charCount++;
          return null;
        }

        state.match = match;

        for (let step = 0; step < match.length; step++) {
          stream.next();
          state.charCount++;
        }

        if (match.rule && match.rule.issueType && SPELLING_ERRORS_TYPES.includes(match.rule.issueType)) {
          return `${BASE_STYLE_CSS_CLASS}-error`
        }

        return `${BASE_STYLE_CSS_CLASS}-warning`

      },
      startState: function() {
        return { lineCount: 0, charCount: 0, match: null};
      },
      blankLine: function(state) {
        state.lineCount++;
      }
    };

    let mode = codeMirrorInstance.getMode(
      config, config.backdrop || "text/plain"
    );

    return codeMirrorInstance.overlayMode(mode, overlay, true);
  });
}

SpellChecker.data = null;
SpellChecker._overlay = null;
SpellChecker._openMatch = null;
SpellChecker.currentRequest = null;


/**
 * Fetches data from the LanguageTool HTTP server via the specified endpoint
 * to check the content of the editor.
 *
 * @param {object} editor - The CodeMirror editor instance.
 */
SpellChecker.fetchData = (editor) => {

  SpellChecker.currentRequest = $.post(`${serverurl}/check/`, {
    text: editor.getValue(),
    language: 'auto',
    motherTongue: 'fr',
  })
    .done(data => {
      // LanguageTool returns an offset, but CodeMirror needs a line and character position
      data.matches = data.matches.map((match) => {
        // Convert global offset to line and character position
        return Object.assign({}, match, {
          position: editor.posFromIndex(match.offset),
        });
      })
      if (debug) {
        console.debug(data)
      }
      SpellChecker.data = data
      SpellChecker.render(editor)
    })
    .fail((err) => {
      if (debug) {
        console.debug(err)
      }
    })
}

SpellChecker.render = (editor) => {
  editor.setOption('mode', config.spellCheckerMode);
}

SpellChecker.hasError = (token) => {
  return token && token.state && token.state.overlayCur && token.state.overlayCur.includes(BASE_STYLE_CSS_CLASS)
}

SpellChecker.getOverlayPosition = (cursorPosition) => {
  const bottomSpace = window.innerHeight - cursorPosition.bottom;
  const rightSpace = window.innerWidth - cursorPosition.right;

  // By default, the overlay is positioned at the bottom-right of the cursor
  let top = cursorPosition.top;
  let left = cursorPosition.left;

  // FIXME: hardcoded values
  const overlay = {
    width: 300,
    height: 162,
  }

  // If there is limited space at the bottom, position the overlay on the top
  if(bottomSpace < overlay.height) {
    top -= overlay.height + 10
  } else {
    // FIXME: arbitrary hardcoded value to open overlay slightly under the cursor
    top += 30  // Assuming a standard lineheight
  }

  // If there is limited space at the right, position the overlay on the left side
  if (rightSpace < overlay.width) {
    left -= overlay.width;
  }

  return {top, left};
}

/**
 * This function uses the close icon from Bootstrap.
 * @see {@link https://icons.getbootstrap.com/icons/x/}
 * @returns {string} HTML string for the close button.
 */
SpellChecker.createHtmlCloseButton = () => {
  return `
    <button id="close-overlay">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/>
      </svg>
    </button>
  `
}

SpellChecker.createHtmlContent = (match) => {
  const shortMessage = match.shortMessage;
  const ruleName = match.rule && match.rule.category && match.rule.category.name ;
  const subtitle = shortMessage || ruleName;

  let html = ''

  // Add a sub-title if available, ex: 'Faute de frappe'
  if (subtitle) {
    html += `<p class='subtitle'>${subtitle}</p>`
  }

  // Add a descriptive message about the match
  html += `<p class='message'>${match.message}</p>`;

  // Add suggestions to fix the match, if available
  if (match.replacements && match.replacements.length > 0) {
    html += "<ul>";
    match.replacements.slice(0, MAXIMUM_NUMBER_OF_REPLACEMENTS).forEach((replacement) => {
      const value = replacement.value === " " ? DELETE_DOUBLE_SPACE_VALUE : replacement.value;
      html += `<li>${value}</li>`;
    })
    html += "</ul>";
  }

  return html;
}


/**
 * Open an overlay to display information about the selected match.
 *
 * @param {object} match - The match object containing details about the detected issue.
 * @param {object} position - The position object specifying where to open the overlay.
 */
SpellChecker.openOverlay = (match, position, onReplacementSelection) => {

  SpellChecker.closeOverlay();

  // Create the overlay element
  const overlay = document.createElement("div");
  overlay.className = "spell-check-overlay";

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

  // Position the overlay
  const {top, left} = SpellChecker.getOverlayPosition(position)
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;

  // Handle click interactions on suggestions
  overlay.addEventListener('click', function(event) {
    if (event.target.tagName === "LI") {
      onReplacementSelection(event.target.textContent);
      SpellChecker.closeOverlay();
    }
  });

  // Store the overlay and the open match in SpellChecker for later reference
  SpellChecker._overlay = overlay;
  SpellChecker._openMatch = match;

  // Append the overlay to the document body
  document.body.appendChild(overlay);

  // Handle click interactions on close button
  const closeButton = document.getElementById('close-overlay')
  closeButton.addEventListener('click', function(event) {
    SpellChecker.closeOverlay();
  })
}

SpellChecker.closeOverlay = () => {
  // Get the current overlay
  const overlay = SpellChecker._overlay;

  // Close the overlay if open
  if (overlay) {
    overlay.parentNode.removeChild(overlay);
    // Clear SpellChecker's state
    SpellChecker._overlay = null;
    SpellChecker._openMatch = null;
  }
}

SpellChecker.reset = () => {

  // Close the overlay if open
  SpellChecker.closeOverlay();

  // Reset SpellChecker's state
  SpellChecker.data = null;
  SpellChecker._overlay = null;
  SpellChecker._openMatch = null;
}

SpellChecker.abortFetchData = () => {
  if (!SpellChecker.currentRequest) {
    return
  }
  SpellChecker.currentRequest.abort();
  SpellChecker.currentRequest = null;
}

SpellChecker.updateMatchIndexes = (change) => {
  SpellChecker.data.matches = SpellChecker.data.matches.map((match) => {
    const isOnSameLine = change.from.line === change.to.line && change.from.line === match.position.line;
    const isInsertedBeforeMatch = change.from.ch < match.position.ch;
    const isSingleInsertion = change.text.length === 1 && change.removed.length === 1;

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


/**
 * The CodeMirror "blur" event cannot reliably close the overlay because it triggers even when clicking on the overlay
 * itself, leading to unintended closure. Furthermore, it lacks information about the click target, it always set to the
 * hidden text area, making it impossible to discern if the click occurred within the overlay or elsewhere.
 */
document.addEventListener("click", function(event) {

  const overlay = document.getElementsByClassName('spell-check-overlay')[0]
  const editor = document.getElementsByClassName('CodeMirror')[0]

  // Check if the click is within the overlay or editor
  if ((overlay && overlay.contains(event.target)) || (editor && editor.contains(event.target))) {
    return;
  }

  // Close the spell checker overlay if the click is outside both
  SpellChecker.closeOverlay();
})
