import introJs from 'intro.js'
import 'intro.js/introjs.css'

export function initTutorial () {
  const spellCheckToggle = document.querySelector('.status-spellcheck')
  const spellCheckStatus = document.querySelector('.spell-check-status')

  if (!spellCheckToggle || !spellCheckStatus) {
    return
  }

  const intro = introJs().setOptions({
    dontShowAgain: true, // Override styles to hide the checkbox
    nextLabel: 'Suivant',
    prevLabel: 'Précédent',
    doneLabel: 'Terminé',
    highlightClass: 'custom-introjs-helperLayer',
    showBullets: false,
    disableInteraction: true,
    exitOnOverlayClick: false,
    steps: [
      {
        title: 'Nouveauté',
        intro: "Un correcteur d’orthographe et de grammaire est disponible en version bêta. Vous pouvez l'activer ou la désactiver en cochant cette case.",
        element: spellCheckToggle
      },
      {
        title: 'Temps réel',
        intro: "Il corrige et reformule vos phrases en temps réel. Ce statut vous informera de l'état de votre document.",
        element: spellCheckStatus
      },
      {
        title: 'Retours',
        intro: 'Une fois le tutoriel terminé, cliquez à tout moment sur ce lien pour partager vos retours.',
        element: document.querySelector('.ui-feedbacks')
      }
    ]
  })
  intro.onexit(() => {
    document.querySelector('body').classList.remove('introjs-tour')
    intro.setDontShowAgain(true)
  })
  intro.start()
}

export function closeTutorial () {
  introJs().exit()
}
