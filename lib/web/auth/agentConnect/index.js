const openIdClient = require('openid-client')

const config = require('../../../config')

const REDIRECT_URI = config.serverURL + '/oidc-callback'
const CLIENT_ID = config.agentConnect.clientId
const CLIENT_SECRET = config.agentConnect.clientSecret
const ISSUER_URL = `${config.agentConnect.baseUrl}/.well-known/openid-configuration`

const SCOPES = 'openid given_name usual_name email siret'
let _client

const getClient = async () => {
  if (_client) {
    return _client
  } else {
    const agentConnectIssuer = await openIdClient.Issuer.discover(ISSUER_URL)

    _client = new agentConnectIssuer.Client({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uris: [REDIRECT_URI],
      // post_logout_redirect_uris: [POST_LOGOUT_REDIRECT_URI],
      userinfo_signed_response_alg: 'ES256'
    })

    return _client
  }
}

const agentConnectAuthorizeUrl = async (req, res) => {
  const client = await getClient()

  const nonce = openIdClient.generators.nonce()
  const state = openIdClient.generators.state()

  req.session.state = state
  req.session.nonce = nonce
  await req.session.save()

  const authorizationUrl = client.authorizationUrl({
    scope: SCOPES,
    acr_values: 'eidas1',
    response_type: 'code',
    nonce,
    state
  })

  res.redirect(authorizationUrl)
}

const agentConnectAuthenticate = async (req, res) => {
  const client = await getClient()

  const params = client.callbackParams(req)
  if (req.session.state !== params.state) {
    res.sendStatus(400)
    return
  }

  const tokenSet = await client.grant({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES
  })

  const accessToken = tokenSet.access_token
  if (!accessToken) {
    res.sendStatus(400)
    return
  }

  const userInfo = await client.userinfo(tokenSet)
  req.session.idToken = tokenSet.id_token
  await req.session.save()
  console.log(userInfo)

  res.redirect(config.serverURL)
}

module.exports = { agentConnectAuthenticate, agentConnectAuthorizeUrl }
