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

import '../../../css/spell-checker.css'

const SPELLING_ERRORS_TYPES = ["misspelling"]
const BASE_STYLE_CSS_CLASS = "spell-check"

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
        return { lineCount: 0, charCount: 0};
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


