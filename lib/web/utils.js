'use strict'

const bodyParser = require('body-parser')
const config = require('../config')

// create application/x-www-form-urlencoded parser
exports.urlencodedParser = bodyParser.urlencoded({
  extended: false,
  limit: 1024 * 1024 * 10 // 10 mb
})

// create text/markdown parser
exports.markdownParser = bodyParser.text({
  inflate: true,
  type: ['text/plain', 'text/markdown'],
  limit: 1024 * 1024 * 10 // 10 mb
})

exports.silentLogin = async function (req, res, next) {
  const silentLoginFailed = req.session.silentLoginFailed
  delete req.session.silentLoginFailed
  if (req.isAuthenticated() || silentLoginFailed) {
    return next()
  }
  req.session.redirectUrl = req.url
  req.session.save((errors) => {
    if (errors) {
      return next()
    }
    return res.redirect(config.serverURL + '/auth/agent-connect?silent=true')
  })
}
