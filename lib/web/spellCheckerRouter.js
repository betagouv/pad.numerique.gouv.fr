'use strict'

const Router = require('express').Router

const { urlencodedParser } = require('./utils')
const spellCheckerRouter = module.exports = Router()

const config = require('../config')

// spell-check note's content
spellCheckerRouter.post('/check/', urlencodedParser, function (req, res) {

  if(!config.spellCheckerEndpoint) {
    // FIXME: handle properly wrong configurations
    console.error('Spell-checker is improperly configured.');
    res.send({});
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
      const data = await response.json();
      res.send(data);
    })
    .catch((err) => {
      res.status(400).send({ error: 'Spell-checker is not responding properly.' });
    })
})
