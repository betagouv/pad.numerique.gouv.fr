'use strict'

const passport = require('passport')
const Router = require('express').Router
const passportStrategy = require('@passport-next/passport-strategy')
const util = require('util')
const openIdClient = require('openid-client')

const { urlencodedParser } = require('../../utils')
const config = require('../../../config')
const models = require('../../../models')
const logger = require('../../../logger')

const REDIRECT_URI = `${config.serverURL}/auth/agent-connect/callback`

let _client

const getClient = async () => {
  if (_client) {
    return _client
  } else {
    const { agentConnect } = config
    const agentConnectIssuer = await openIdClient.Issuer.discover(
      `${agentConnect.baseUrl}/.well-known/openid-configuration`
    )
    _client = new agentConnectIssuer.Client({
      client_id: agentConnect.clientID,
      client_secret: agentConnect.clientSecret,
      redirect_uris: [REDIRECT_URI],
      userinfo_signed_response_alg: agentConnect.userinfoSignedResponseAlg
    })
    return _client
  }
}

const agentConnectAuth = module.exports = Router()

function AgentConnectStrategy (options, verify) {
  passport.Strategy.call(this)
  this.name = 'agentConnect'
  this._verify = verify
}

util.inherits(AgentConnectStrategy, passportStrategy.Strategy)

AgentConnectStrategy.prototype.authenticate = async function (req) {
  const client = await getClient()

  // If a code is present in the query parameters, the authentication process is triggered for the callback
  if (req.query && req.query.code) {
    const params = client.callbackParams(req)

    const {
      state,
      nonce
    } = req.session

    delete req.session.nonce
    delete req.session.state

    try {
      const tokenSet = await client.callback(
        REDIRECT_URI,
        params,
        { state, nonce }
      )
      // Persist 'id_token' in session's data to retrieve it when logging-out
      req.session.id_token = tokenSet.id_token
      req.session.save(async () => {
        // Retrieve user information from the UserInfo endpoint
        const userInfo = await client.userinfo(tokenSet)

        // Verify user information and call passport callback functions
        const self = this
        function verified (err, user, info) {
          if (err) { return this.error(err) }
          if (!user) { return this.fail(info) }
          self.success(user, info)
        }
        self._verify(userInfo.email, userInfo, verified)
      })
    } catch (e) {
      logger.error('authentication callback failed: ' + e)
      throw new Error('Suspicious operation, authentication callback failed.')
    }
  } else if (req.query && req.query.error) {
    const { error, error_description: description } = req.query
    const errorMsg = `${error}, ${description}`
    logger.error(`auth callback failed: ${errorMsg}`)
    if (error === 'login_required') {
      req.session.silentLoginFailed = true
      req.session.save(() => {
        return this.fail(errorMsg)
      })
    } else {
      return this.fail(errorMsg)
    }
  } else {
    // Generate nonce and state parameters for OIDC Authorization Request
    const nonce = openIdClient.generators.nonce()
    const state = openIdClient.generators.state()

    // Persist state and nonce to session cache to handle Authorization callback
    req.session.state = state
    req.session.nonce = nonce
    req.session.save(() => {
      const params = {
        scope: config.agentConnect.scopes,
        acr_values: config.agentConnect.acrValues,
        response_type: 'code',
        nonce,
        state
      }

      const isSilentLogin = req.query.silent === 'true'
      if (isSilentLogin) {
        params.prompt = 'none'
      }

      // Redirect the user to the authorization URL
      const authorizationUrl = client.authorizationUrl(params)
      this.redirect(authorizationUrl)
    })
  }
}

passport.use(new AgentConnectStrategy({}, function (profileId, profile, done) {
  if (!profileId) {
    const err = 'User identifier was returned undefined'
    logger.error('auth callback failed: ' + err)
    return done(err, null)
  }
  profile.displayName = profileId
  const stringifiedProfile = JSON.stringify(profile)
  models.User.findOrCreate({
    where: {
      profileid: profileId
    },
    defaults: {
      profile: stringifiedProfile
    }
  }).spread(function (user, created) {
    if (user) {
      let needSave = false
      if (user.profile !== stringifiedProfile) {
        user.profile = stringifiedProfile
        needSave = true
      }
      if (needSave) {
        user.save().then(function () {
          logger.debug(`user login: ${user.id}`)
          return done(null, user)
        })
      } else {
        logger.debug(`user login: ${user.id}`)
        return done(null, user)
      }
    }
  }).catch(function (err) {
    logger.error('auth callback failed: ' + err)
    return done(err, null)
  })
}))

agentConnectAuth.get('/auth/agent-connect', urlencodedParser, function (req, res, next) {
  passport.authenticate('agentConnect')(req, res, next)
})

agentConnectAuth.get('/auth/agent-connect/callback', function (req, res, next) {
  const redirectUrl = req.session.redirectUrl || '/'
  delete req.session.redirectUrl
  req.session.save(() => {
    passport.authenticate('agentConnect', {
      successReturnToOrRedirect: config.serverURL + redirectUrl,
      failureRedirect: config.serverURL + redirectUrl,
      keepSessionInfo: true
    })(req, res, next)
  })
})

agentConnectAuth.get('/auth/agent-connect/logout', async function (req, res) {
  const client = await getClient()

  if (config.debug && req.isAuthenticated()) {
    logger.debug('user logout: ' + req.user.id)
  }

  const {
    id_token: idToken
  } = req.session
  delete req.session.id_token

  if (!idToken) {
    req.logout(() => {
      res.redirect(config.serverURL + '/logout')
    })
  }

  const state = openIdClient.generators.state()
  req.session.state = state
  req.session.save(() => {
    const endSessionUrl = client.endSessionUrl({
      id_token_hint: idToken,
      post_logout_redirect_uri: config.serverURL + '/auth/agent-connect/logout/callback',
      state
    })
    res.redirect(endSessionUrl)
  })
})

agentConnectAuth.get('/auth/agent-connect/logout/callback', async function (req, res) {
  const client = await getClient()
  const params = client.callbackParams(req)

  if (req.session.state !== params.state) {
    logger.error('logout callback failed: state validation failed.')
    throw new Error('Suspicious operation, logout callback failed.')
  }
  req.logout(() => {
    res.redirect(config.serverURL + '/')
  })
})
