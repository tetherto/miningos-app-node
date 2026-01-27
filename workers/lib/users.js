'use strict'

class UserService {
  constructor ({ sqlite, auth }) {
    this._auth = auth
    this._sqlite = sqlite
  }

  parseUserRow (userRow) {
    const { email, roles, name, id } = userRow
    const role = JSON.parse(roles)[0]
    return {
      id,
      email,
      name,
      role
    }
  }

  async createUser ({ email, name, role }) {
    return await this._auth.createUser({
      email,
      name,
      roles: [role]
    })
  }

  async listUsers () {
    const userRows = await this._auth.listUsers()

    return userRows.filter(user => user.id !== 1).map(this.parseUserRow.bind(this))
  }

  async updateUser ({ id, email, name = null, role }) {
    const token = await this._auth.genToken({
      ips: ['127.0.0.1'],
      userId: id,
      roles: []
    })

    return await this._auth.updateUser({
      token,
      email,
      name,
      roles: [role]
    })
  }

  deleteUser (id) {
    return this._auth.deleteUser(id)
  }

  getUser (id) {
    return this._auth.getUserById(id)
  }
}

module.exports = {
  UserService
}
