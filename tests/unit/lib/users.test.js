'use strict'

const test = require('brittle')
const { UserService } = require('../../../workers/lib/users')

test('UserService - constructor', (t) => {
  const mockAuth = {}
  const mockSqlite = {}
  const userService = new UserService({ sqlite: mockSqlite, auth: mockAuth })

  t.ok(userService._auth === mockAuth, 'should store auth')
  t.ok(userService._sqlite === mockSqlite, 'should store sqlite')

  t.pass()
})

test('UserService - parseUserRow', (t) => {
  const userService = new UserService({ sqlite: {}, auth: {} })
  const userRow = {
    id: 123,
    email: 'test@example.com',
    name: 'Test User',
    roles: '["admin"]'
  }

  const result = userService.parseUserRow(userRow)

  t.is(result.id, 123, 'should parse id')
  t.is(result.email, 'test@example.com', 'should parse email')
  t.is(result.name, 'Test User', 'should parse name')
  t.is(result.role, 'admin', 'should parse role from JSON')

  t.pass()
})

test('UserService - createUser', async (t) => {
  let createUserCalled = false
  let createUserArgs = null
  const mockAuth = {
    createUser: async (data) => {
      createUserCalled = true
      createUserArgs = data
      return { id: 123, ...data }
    }
  }
  const userService = new UserService({ sqlite: {}, auth: mockAuth })

  const result = await userService.createUser({
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin'
  })

  t.ok(createUserCalled, 'should call auth.createUser')
  t.is(createUserArgs.email, 'test@example.com', 'should pass email')
  t.is(createUserArgs.name, 'Test User', 'should pass name')
  t.ok(Array.isArray(createUserArgs.roles), 'should pass roles as array')
  t.is(createUserArgs.roles[0], 'admin', 'should pass correct role')
  t.ok(result.id, 'should return created user')

  t.pass()
})

test('UserService - listUsers', async (t) => {
  const mockUsers = [
    { id: 1, email: 'admin@example.com', roles: '["*"]' },
    { id: 2, email: 'user1@example.com', roles: '["user"]' },
    { id: 3, email: 'user2@example.com', roles: '["admin"]' }
  ]
  const mockAuth = {
    listUsers: async () => mockUsers
  }
  const userService = new UserService({ sqlite: {}, auth: mockAuth })

  const result = await userService.listUsers()

  t.ok(Array.isArray(result), 'should return array')
  t.is(result.length, 2, 'should filter out super admin (id=1)')
  t.is(result[0].id, 2, 'should return first user')
  t.is(result[1].id, 3, 'should return second user')

  t.pass()
})

test('UserService - listUsers with only super admin', async (t) => {
  const mockUsers = [
    { id: 1, email: 'admin@example.com', roles: '["*"]' }
  ]
  const mockAuth = {
    listUsers: async () => mockUsers
  }
  const userService = new UserService({ sqlite: {}, auth: mockAuth })

  const result = await userService.listUsers()

  t.ok(Array.isArray(result), 'should return array')
  t.is(result.length, 0, 'should return empty array when only super admin exists')

  t.pass()
})

test('UserService - updateUser', async (t) => {
  let genTokenCalled = false
  let updateUserCalled = false
  let updateUserArgs = null
  const mockAuth = {
    genToken: async (data) => {
      genTokenCalled = true
      return 'mock-token'
    },
    updateUser: async (data) => {
      updateUserCalled = true
      updateUserArgs = data
      return { id: 123, ...data }
    }
  }
  const userService = new UserService({ sqlite: {}, auth: mockAuth })

  const result = await userService.updateUser({
    id: 123,
    email: 'updated@example.com',
    name: 'Updated User',
    role: 'admin'
  })

  t.ok(genTokenCalled, 'should call genToken')
  t.ok(updateUserCalled, 'should call updateUser')
  t.is(updateUserArgs.email, 'updated@example.com', 'should pass email')
  t.is(updateUserArgs.name, 'Updated User', 'should pass name')
  t.ok(Array.isArray(updateUserArgs.roles), 'should pass roles as array')
  t.is(updateUserArgs.roles[0], 'admin', 'should pass correct role')
  t.ok(result.id, 'should return updated user')

  t.pass()
})

test('UserService - updateUser with null name', async (t) => {
  let updateUserArgs = null
  const mockAuth = {
    genToken: async () => 'mock-token',
    updateUser: async (data) => {
      updateUserArgs = data
      return { id: 123 }
    }
  }
  const userService = new UserService({ sqlite: {}, auth: mockAuth })

  await userService.updateUser({
    id: 123,
    email: 'test@example.com',
    name: null,
    role: 'admin'
  })

  t.is(updateUserArgs.name, null, 'should pass null name')

  t.pass()
})

test('UserService - deleteUser', async (t) => {
  let deleteUserCalled = false
  let deleteUserId = null
  const mockAuth = {
    deleteUser: async (id) => {
      deleteUserCalled = true
      deleteUserId = id
      return true
    }
  }
  const userService = new UserService({ sqlite: {}, auth: mockAuth })

  const result = await userService.deleteUser(123)

  t.ok(deleteUserCalled, 'should call auth.deleteUser')
  t.is(deleteUserId, 123, 'should pass correct id')
  t.is(result, true, 'should return result')

  t.pass()
})

test('UserService - getUser', async (t) => {
  let getUserByIdCalled = false
  let getUserByIdId = null
  const mockUser = { id: 123, email: 'test@example.com' }
  const mockAuth = {
    getUserById: async (id) => {
      getUserByIdCalled = true
      getUserByIdId = id
      return mockUser
    }
  }
  const userService = new UserService({ sqlite: {}, auth: mockAuth })

  const result = await userService.getUser(123)

  t.ok(getUserByIdCalled, 'should call auth.getUserById')
  t.is(getUserByIdId, 123, 'should pass correct id')
  t.ok(result.id, 'should return user')
  t.is(result.email, 'test@example.com', 'should return correct user')

  t.pass()
})
