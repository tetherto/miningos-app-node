'use strict'
const { SUPER_ADMIN_ID, MIGRATED_USER_ROLES } = require('./constants')

class AuthLib {
  constructor ({ httpc, httpd, userService, auth }) {
    this._httpc = httpc
    this._httpd = httpd
    this._userService = userService
    this._auth = auth
  }

  async migrateUsers (httpdAuth) {
    const users = await this._auth.listUsers()
    if (users.length > 1) {
      // The super admin will already be present
      // Skip migration if other users are present
      return
    }

    try {
      console.log('Starting user migration')
      const oldUsers = httpdAuth.conf.users || []

      const superAdmin = users.find(user => user.id.toString() === SUPER_ADMIN_ID)

      await Promise.all(oldUsers.map(async oldUser => {
        if (oldUser.email === superAdmin.email) {
          return // Skip super admin
        }

        const role = oldUser.write ? MIGRATED_USER_ROLES.DEFAULT : MIGRATED_USER_ROLES.READ_ONLY

        try {
          await this._userService.createUser({ email: oldUser.email, role })
        } catch (error) {
          console.error(`Failed to migrate user: ${oldUser.email}`, error)
        }
      }))

      console.log('Migration complete')
    } catch (error) {
      console.error('Unexpected error occurred during migration. Migration Failed!', error)
      throw error
    }
  }

  async start () {
    this._auth.addHandlers({
      google: this._resolveOAuthGoogle.bind(this)
    })
  }

  async regenerateToken ({ oldToken, ips, ttl = 300, pfx = 'pub', scope = 'api', roles = [] }) {
    return await this._auth.regenerateToken({
      oldToken,
      ips,
      ttl,
      pfx,
      scope,
      roles
    })
  }

  async resolveToken (token, ips) {
    return await this._auth.resolveToken(token, ips, { updateLastActive: true })
  }

  async getTokenPerms (token) {
    const { superadmin: superAdmin, perms = [] } = this._auth.getTokenPerms(token)
    const write = superAdmin || (await this._auth.tokenHasPerms(token, 'actions:w'))
    const applicablePerms = superAdmin ? (this._auth.conf.superAdminPerms ?? []) : perms
    const caps = applicablePerms.map(perm => perm.split(':')[0])

    return { write, caps, superAdmin, permissions: applicablePerms }
  }

  async tokenHasPerms (token, write, requestedPerms, matchAll = false) {
    const perms = await this.getTokenPerms(token)
    if (perms.superAdmin) {
      return true
    }

    if (write && !perms.write) {
      return false
    }

    const resolved = await Promise.all(requestedPerms.map(perm => this._auth.tokenHasPerms(token, perm)))

    return matchAll
      ? resolved.every(res => res)
      : resolved.some(res => res)
  }

  async cleanupTokens () {
    await this._auth.cleanupTokens()
  }

  async _resolveOAuthGoogle (ctx, req) {
    const oauthRes = await this._httpd.server.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(req)
    const { body: info } = await this._httpc.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { authorization: 'Bearer ' + oauthRes.token.access_token },
        encoding: 'json'
      }
    )

    if (!info) {
      return null
    }

    return {
      email: info.email
    }
  }
}

module.exports = AuthLib
