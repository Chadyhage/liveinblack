import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const webRoot = process.cwd()
const mobileRoot = path.resolve(webRoot, '../LIB_Mobile')
const mobileSourceRoots = ['app', 'context', 'lib'].map((part) => path.join(mobileRoot, part))

function walk(directory, predicate) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(absolute, predicate)
    return predicate(absolute) ? [absolute] : []
  })
}

function methodFromCall(call) {
  const options = call.arguments[1]
  if (!options) return 'GET'
  if (!ts.isObjectLiteralExpression(options)) return 'UNKNOWN'
  const method = options.properties.find(
    (property) => ts.isPropertyAssignment(property) && property.name.getText() === 'method'
  )
  if (!method || !ts.isPropertyAssignment(method) || !ts.isStringLiteralLike(method.initializer)) return 'GET'
  return method.initializer.text.toUpperCase()
}

function nearestFunctionName(node) {
  let current = node.parent
  let localName = null
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && !localName) localName = current.name.text
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText()
    current = current.parent
  }
  return localName ?? '(module)'
}

const calls = []
let unparsedBackendCalls = 0
const mobileFiles = mobileSourceRoots.flatMap((root) => walk(root, (name) => /\.(ts|tsx)$/.test(name)))
for (const file of mobileFiles) {
  const sourceText = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)
  const initializers = new Map()
  const declaredTypes = new Map()
  const typeAliases = new Map()

  function collectDeclarations(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer) initializers.set(node.name.text, node.initializer)
      if (node.type) declaredTypes.set(node.name.text, node.type)
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.type) {
      declaredTypes.set(node.name.text, node.type)
    }
    if (ts.isTypeAliasDeclaration(node)) typeAliases.set(node.name.text, node.type)
    ts.forEachChild(node, collectDeclarations)
  }
  collectDeclarations(source)

  function valuesFromType(typeNode, seen = new Set()) {
    if (!typeNode) return null
    if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteralLike(typeNode.literal)) return [typeNode.literal.text]
    if (ts.isUnionTypeNode(typeNode)) {
      const values = typeNode.types.flatMap((part) => valuesFromType(part, seen) ?? [])
      return values.length === typeNode.types.length ? values : null
    }
    if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
      const name = typeNode.typeName.text
      if (seen.has(name)) return null
      const alias = typeAliases.get(name)
      return alias ? valuesFromType(alias, new Set([...seen, name])) : null
    }
    return null
  }

  function fragmentsFromExpression(expression, seen = new Set()) {
    if (ts.isStringLiteralLike(expression)) return [expression.text]
    if (ts.isIdentifier(expression)) {
      const name = expression.text
      if (seen.has(name)) return ['[param]']
      const initializer = initializers.get(name)
      if (initializer) return fragmentsFromExpression(initializer, new Set([...seen, name]))
      return valuesFromType(declaredTypes.get(name)) ?? ['[param]']
    }
    if (ts.isConditionalExpression(expression)) {
      return [
        ...fragmentsFromExpression(expression.whenTrue, seen),
        ...fragmentsFromExpression(expression.whenFalse, seen),
      ]
    }
    if (ts.isTemplateExpression(expression)) {
      let values = [expression.head.text]
      for (const span of expression.templateSpans) {
        const fragments = fragmentsFromExpression(span.expression, seen)
        values = values.flatMap((value) => fragments.map((fragment) => value + fragment + span.literal.text))
      }
      return values
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = fragmentsFromExpression(expression.left, seen)
      const right = fragmentsFromExpression(expression.right, seen)
      return left.flatMap((prefix) => right.map((suffix) => prefix + suffix))
    }
    return ['[param]']
  }

  function mobilePathsFromExpression(expression) {
    if (!expression || (!ts.isStringLiteralLike(expression) && !ts.isTemplateExpression(expression) && !ts.isBinaryExpression(expression))) {
      return null
    }
    return [...new Set(fragmentsFromExpression(expression))]
  }

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['apiFetch', 'networkFetch'].includes(node.expression.text)) {
      const rawPaths = mobilePathsFromExpression(node.arguments[0])
      let parsed = false
      for (const raw of rawPaths ?? []) {
        const apiStart = raw.indexOf('/api/')
        if (apiStart < 0) continue
        const apiPath = raw.slice(apiStart).split('?')[0]
        parsed = true
        calls.push({
          file: path.relative(mobileRoot, file),
          functionName: nearestFunctionName(node),
          method: methodFromCall(node),
          path: apiPath,
          admin: apiPath.startsWith('/api/agent/'),
        })
      }
      if (!parsed && sourceText.slice(node.pos, node.end).includes('/api/')) {
        unparsedBackendCalls += 1
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

function routePath(file) {
  const relative = path.relative(path.join(webRoot, 'app'), file).replaceAll(path.sep, '/')
  return '/' + relative.replace(/\/route\.ts$/, '')
}

function exportedMethods(sourceText) {
  const methods = new Set()
  for (const match of sourceText.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) {
    methods.add(match[1])
  }
  for (const match of sourceText.matchAll(/export\s+const\s*\{([^}]+)\}\s*=\s*/g)) {
    for (const method of match[1].match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g) || []) methods.add(method)
  }
  return methods
}

function patternRegex(pattern) {
  const segments = pattern.split('/').filter(Boolean).map((segment) => {
    if (/^\[\.\.\..+\]$/.test(segment)) return '.+'
    if (/^\[.+\]$/.test(segment)) return '[^/]+'
    return segment.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
  })
  return new RegExp('^/' + segments.join('/') + '$')
}

const routeFiles = walk(path.join(webRoot, 'app/api'), (name) => name.endsWith(path.sep + 'route.ts'))
const routes = routeFiles.map((file) => {
  const route = routePath(file)
  const segments = route.split('/').filter(Boolean)
  return {
    file: path.relative(webRoot, file),
    route,
    regex: patternRegex(route),
    segments,
    specificity: segments.filter((segment) => !/^\[.+\]$/.test(segment)).length,
    methods: exportedMethods(fs.readFileSync(file, 'utf8')),
  }
}).sort((a, b) => b.specificity - a.specificity || b.segments.length - a.segments.length)

function compatibleRoute(callPath, route) {
  const callSegments = callPath.split('/').filter(Boolean)
  const catchAllIndex = route.segments.findIndex((segment) => /^\[\.\.\..+\]$/.test(segment))
  if (catchAllIndex < 0 && callSegments.length !== route.segments.length) return false
  if (catchAllIndex >= 0 && callSegments.length <= catchAllIndex) return false
  const fixedLength = catchAllIndex >= 0 ? catchAllIndex : route.segments.length
  return callSegments.slice(0, fixedLength).every((segment, index) => {
    const routeSegment = route.segments[index]
    if (segment === '[param]') return /^\[(?!\.\.\.).+\]$/.test(routeSegment)
    return /^\[.+\]$/.test(routeSegment) || segment === routeSegment
  })
}

const uniqueCalls = [...new Map(calls.map((call) => [call.method + ' ' + call.path, call])).values()]
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))

const results = uniqueCalls.map((call) => {
  const candidates = routes.filter((candidate) => compatibleRoute(call.path, candidate))
  const bestSpecificity = candidates[0]?.specificity
  const bestCandidates = candidates.filter((candidate) => candidate.specificity === bestSpecificity)
  const route = bestCandidates.find((candidate) => candidate.methods.has(call.method)) ?? bestCandidates[0]
  const status = !route
    ? 'missing_route'
    : call.method === 'UNKNOWN'
      ? 'unknown_method'
      : route.methods.has(call.method)
        ? 'ok'
        : 'missing_method'
  return {
    ...call,
    route: route?.route ?? null,
    routeFile: route?.file ?? null,
    availableMethods: route ? [...route.methods].sort() : [],
    status,
  }
})

// Tous les appels mobiles font partie du contrat de production, y compris
// l’espace agent. Le flag `admin` reste exposé dans le JSON pour faciliter le
// tri, mais ne doit plus retirer ces appels du verdict global.
const clientResults = results.filter((result) => !result.admin)
const adminResults = results.filter((result) => result.admin)
const failures = results.filter((result) => result.status !== 'ok')

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    clientResults,
    adminResults,
    unparsedBackendCalls,
    failures,
  }))
  if (failures.length > 0 || unparsedBackendCalls > 0) process.exitCode = 1
  process.exit()
}

console.log(
  'Contrat mobile complet : ' +
    results.filter((result) => result.status === 'ok').length +
    '/' +
    results.length +
    ' appels uniques reliés à une route et une méthode.'
)
console.log('Dont espace agent : ' + adminResults.length + ' appels.')
console.log('Appels backend non analysables statiquement : ' + unparsedBackendCalls + '.')

for (const result of failures) {
  console.error(
    '[' + result.status + '] ' + result.method + ' ' + result.path + ' — ' + result.file + ':' + result.functionName +
      (result.route ? ' (route ' + result.route + ', méthodes: ' + (result.availableMethods.join(', ') || 'aucune') + ')' : '')
  )
}

if (failures.length > 0 || unparsedBackendCalls > 0) process.exitCode = 1
