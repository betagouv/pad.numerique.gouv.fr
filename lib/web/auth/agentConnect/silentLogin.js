const config = require('../../../config')

module.exports = function silentLogin (req, res, next) {
  if (!config.isAgentConnectEnable) {
    return next()
  }
  const hasSilentLoginFailed = req.session.hasSilentLoginFailed
  delete req.session.hasSilentLoginFailed
  if (req.isAuthenticated() || hasSilentLoginFailed) {
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
