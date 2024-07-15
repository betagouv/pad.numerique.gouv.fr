const config = require('../../../config')

module.exports = function silentLogin (req, res, next) {
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
