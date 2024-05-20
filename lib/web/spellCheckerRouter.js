'use strict'

const Router = require('express').Router

const { urlencodedParser } = require('./utils')
const spellCheckerRouter = module.exports = Router()

const config = require('../config')

// spell-check note's content
spellCheckerRouter.post('/check/', urlencodedParser, function (req, res) {
  if (!config.spellCheckerEndpoint) {
    console.error('Spell-checker is improperly configured.')
    res.status(400).send({ error: 'Spell-checker is improperly configured.' })
  }

  fetch(config.spellCheckerEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      text: req.body.text,
      language: req.body.language
    })
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Received a ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      res.send(data)
    })
    .catch((err) => {
      console.error('Spell-checker is not responding properly: ', err.message)
      res.status(400).send({ error: 'Spell-checker is not responding properly.' })
    })
})
