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
    language: 'fr',
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

  let html = '';

  // Add a close button
  html += `
    <button id="close-overlay">X</button>
  `

  // Add a title if available, ex: 'Faute de frappe'
  const shortMessage = match.shortMessage;
  const ruleName = match.rule && match.rule.category && match.rule.category.name ;
  const title = shortMessage || ruleName;
  if (title) {
    html += `<p><strong>${title}</strong></p>`;
  }

  // Add a descriptive message about the match
  html += `<p>${match.message}</p>`;

  // Add suggestions to fix the match, if available
  if (match.replacements && match.replacements.length > 0) {
    html += "<p>Suggestions :</p>";
    html += "<ul>";
    match.replacements.slice(0, MAXIMUM_NUMBER_OF_REPLACEMENTS).forEach((replacement) => {
      const value = replacement.value === " " ? DELETE_DOUBLE_SPACE_VALUE : replacement.value;
      html += `<li>${value}</li>`;
    })
    html += "</ul>";
  }

  // Set the HTML content of the overlay
  overlay.innerHTML = html;

  // Position the overlay
  const {top, left} = SpellChecker.getOverlayPosition(position)
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;

  // Handle click interactions
  overlay.addEventListener('click', function(event) {
    if (event.target.id === "close-overlay") {
      SpellChecker.closeOverlay();
    }
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
