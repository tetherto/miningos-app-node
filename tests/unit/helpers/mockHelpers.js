'use strict'

const createMockCtxWithOrks = (orks = [{ rpcPublicKey: 'key1' }], jRequestImpl = async () => ({})) => {
  return {
    conf: {
      orks
    },
    net_r0: {
      jRequest: jRequestImpl
    }
  }
}

const createMockCtxWithOrksAndNet = (orks, netImpl) => {
  return {
    conf: {
      orks
    },
    net_r0: netImpl
  }
}

const createMockAuthCtx = (authLib = {}, userService = {}, globalDataLib = {}) => {
  return {
    authLib,
    userService,
    globalDataLib,
    auth_a0: {
      conf: {
        roles: {},
        roleManagement: {}
      }
    }
  }
}

const createMockUserInfo = (userId = 'user123', email = 'user@example.com', roles = '["user"]') => {
  return {
    _info: {
      user: {
        userId,
        metadata: {
          email,
          roles
        }
      },
      authToken: 'test-token'
    }
  }
}

const createMockReq = (query = {}, body = {}, userInfo = null) => {
  const req = {
    query,
    body
  }
  if (userInfo) {
    req._info = userInfo
  }
  return req
}

const createMockReqWithUser = (query = {}, body = {}, userId = 'user123', email = 'user@example.com', roles = '["user"]') => {
  return {
    query,
    body,
    _info: {
      user: {
        userId,
        metadata: {
          email,
          roles
        }
      },
      authToken: 'test-token'
    }
  }
}

const createMockAuthCtxWithRoles = (roles = { admin: {} }, roleManagement = { admin: ['admin', 'user'] }) => {
  return {
    auth_a0: {
      conf: {
        roles,
        roleManagement
      }
    }
  }
}

const createMockUserCtx = (userService = {}, authCtx = null) => {
  const baseCtx = { userService }
  if (authCtx) {
    return { ...baseCtx, ...authCtx }
  }
  return { ...baseCtx, ...createMockAuthCtxWithRoles() }
}

const createRoutesForTest = (routesPath) => {
  const mockCtx = {}
  return require(routesPath)(mockCtx)
}

module.exports = {
  createMockCtxWithOrks,
  createMockCtxWithOrksAndNet,
  createMockAuthCtx,
  createMockUserInfo,
  createMockReq,
  createMockReqWithUser,
  createMockAuthCtxWithRoles,
  createMockUserCtx,
  createRoutesForTest
}
