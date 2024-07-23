import introJs from 'intro.js'
import 'intro.js/introjs.css'

export function initTutorial () {
  introJs().setOptions({
    nextLabel: 'Suivant',
    prevLabel: 'Précédent',
    doneLabel: 'Terminé',
    steps: [
      {
        title: 'Nouveauté',
        intro: "La correction orthographique est disponible en version bêta. Vous pouvez l'activer ou la désactiver en cochant cette case.",
        element: document.querySelector('.status-spellcheck')
      },
      {
        title: 'Alertes et retours',
        intro: "Cette icône vous alerte en temps réel sur l'orthographe de votre document. \n\nLors de la rédaction d'un document, cliquez dessus pour nous partager vos retours sur la fonctionnalité.",
        element: document.querySelector('.spell-check-status')
      }
    ]
  }).start()
}

export function closeTutorial () {
  introJs().exit()
}
