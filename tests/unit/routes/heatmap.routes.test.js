'use strict'

const test = require('brittle')
const { testModuleStructure, testHandlerFunctions, testOnRequestFunctions } = require('../helpers/routeTestHelpers')

test('heatmap routes - module structure', (t) => {
  const routes = testModuleStructure(t, '../../../workers/lib/server/routes/heatmap.routes.js', 'heatmap')
  testHandlerFunctions(t, routes, 'heatmap')
  testOnRequestFunctions(t, routes, 'heatmap')
})

test('heatmap routes - route definitions', (t) => {
  const routes = require('../../../workers/lib/server/routes/heatmap.routes.js')({})

  t.alike(routes.map(route => route.url), ['/auth/heatmap', '/auth/heatmap/dates'])
  routes.forEach(route => t.is(route.method, 'GET'))
})
