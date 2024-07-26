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
        intro: "La correction orthographique est disponible en version bêta. Vous pouvez l'activer ou la désactiver en cochant cette case.",
        element: spellCheckToggle
      },
      {
        title: 'Alertes et retours',
        intro: "Cette icône vous alerte en temps réel sur l'orthographe de votre document. \n\nLors de la rédaction d'un document, cliquez dessus pour nous partager vos retours sur la fonctionnalité.",
        element: spellCheckStatus
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
