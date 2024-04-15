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
  spellCheckerEndpoint,
} from '../config'

import '../../../css/spell-checker.css'

// SpellChecker configurations
const SPELLING_ERRORS_TYPES = ["misspelling"]
const MAXIMUM_NUMBER_OF_REPLACEMENTS = 5;
const BASE_STYLE_CSS_CLASS = "spell-check";
export const TYPING_TIMEOUT_DURATION = 500;

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

        if (!SpellChecker.data || !SpellChecker.data.matches || SpellChecker.isFetching) {
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
SpellChecker.isFetching = null;
SpellChecker.hasError = null;
SpellChecker._overlay = null;
SpellChecker._openMatch = null;


/**
 * Fetches data from the LanguageTool HTTP server via the specified endpoint
 * to check the content of the editor.
 *
 * @param {object} editor - The CodeMirror editor instance.
 */
SpellChecker.fetchData = (editor) => {
  if (!spellCheckerEndpoint) {
    console.log("CodeMirror Spell Checker: You must provide a spell-checker endpoint via the config `spellcheckerEndpoint`");
    return
  }
  // FIXME: Consider making the mode configurable rather than hardcoding it
  editor.setOption('mode', 'gfm')

  SpellChecker.isFetching = true;
  SpellChecker.data = null;

  // FIXME: Proxy request through backend for better security and control
  fetch(spellCheckerEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      text: editor.getValue(),
      language: 'fr',
    })
  })
    .then(async (response) => {
      const data = await response.json();
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
      SpellChecker.isFetching = false;
      // FIXME: Consider making the mode configurable rather than hardcoding it
      editor.setOption('mode', 'spell-checker');
    })
    .catch((err) => {
      if (debug) {
        console.debug(err)
      }
      SpellChecker.isFetching = false;
    })
}

SpellChecker.hasError = (token) => {
  return token && token.state && token.state.overlayCur && token.state.overlayCur.includes(BASE_STYLE_CSS_CLASS)
}

/**
 * Open an overlay to display information about the selected match.
 *
 * @param {object} match - The match object containing details about the detected issue.
 * @param {object} position - The position object specifying where to open the overlay.
 */
SpellChecker.openOverlay = (match, position) => {

  SpellChecker.closeOverlay();

  // Create the overlay element
  const overlay = document.createElement("div");
  overlay.className = "spell-check-overlay";

  let html = '';

  // Add a short message if available, ex: 'Faute de frappe'
  if (match.shortMessage) {
    html += `<p><strong>${match.shortMessage}</strong></p>`;
  }

  // Add a descriptive message about the match
  html += `<p>${match.message}</p>`;

  // Add suggestions to fix the match, if available
  if (match.replacements && match.replacements.length > 0) {
    html += "<p>Suggestions :</p>";
    html += "<ul>";
    match.replacements.slice(0, MAXIMUM_NUMBER_OF_REPLACEMENTS).forEach((replacement) => {
      html += `<li>${replacement.value}</li>`;
    })
    html += "</ul>";
  }

  // Set the HTML content of the overlay
  overlay.innerHTML = html;

  // Position the overlay
  overlay.style.left = position.left + "px";
  // FIXME: arbitrary hardcoded value to open overlay slightly under the cursor
  overlay.style.top = position.top + 30 + "px";

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
