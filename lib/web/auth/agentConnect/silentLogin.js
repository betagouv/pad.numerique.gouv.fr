const config = require('../../../config')

module.exports = function silentLogin (req, res, next) {
  if (!config.isAgentConnectEnable) {
    return next()
  }
  const hasSilentLoginFailed = req.session.hasSilentLoginFailed
  const redirectAfterForbiddenAccess = req.session.redirectAfterForbiddenAccess
  delete req.session.hasSilentLoginFailed
  delete req.session.redirectAfterForbiddenAccess
  if (req.isAuthenticated() || hasSilentLoginFailed || redirectAfterForbiddenAccess) {
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
