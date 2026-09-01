import { NextResponse } from 'next/server'

type CronHandlerResult = Response | Record<string, unknown> | undefined

type CronHandler = () => Promise<CronHandlerResult>

type CronOptions = {
  route: string
}

type ObservedRouteOptions = {
  route: string
  operation?: string
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return { message: String(error) }
}

function log(level: 'info' | 'error' | 'warn', payload: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    service: 'live-in-black-web',
    ...payload,
  })

  if (level === 'error') {
    console.error(line)
    return
  }

  if (level === 'warn') {
    console.warn(line)
    return
  }

  console.log(line)
}

export function getVercelRequestId(req: Request) {
  return req.headers.get('x-vercel-id') ?? req.headers.get('x-request-id') ?? undefined
}

export async function runVercelCron(req: Request, options: CronOptions, handler: CronHandler) {
  const start = Date.now()
  const requestId = getVercelRequestId(req)
  const { route } = options

  log('info', {
    msg: 'cron_start',
    route,
    requestId,
  })

  const secret = process.env.CRON_SECRET
  if (!secret) {
    log('error', {
      msg: 'cron_not_configured',
      route,
      requestId,
      ms: Date.now() - start,
    })
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 500 })
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    log('warn', {
      msg: 'cron_unauthorized',
      route,
      requestId,
      ms: Date.now() - start,
    })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await handler()
    const response = result instanceof Response ? result : NextResponse.json({ ok: true, ...(result ?? {}) })

    log('info', {
      msg: 'cron_done',
      route,
      requestId,
      status: response.status,
      ms: Date.now() - start,
    })

    return response
  } catch (error) {
    log('error', {
      msg: 'cron_failed',
      route,
      requestId,
      error: serializeError(error),
      ms: Date.now() - start,
    })
    return NextResponse.json({ error: 'cron_failed' }, { status: 500 })
  }
}

export async function runObservedRoute(req: Request, options: ObservedRouteOptions, handler: CronHandler) {
  const start = Date.now()
  const requestId = getVercelRequestId(req)
  const { route, operation = 'api' } = options

  log('info', {
    msg: `${operation}_start`,
    route,
    method: req.method,
    requestId,
  })

  try {
    const result = await handler()
    const response = result instanceof Response ? result : NextResponse.json(result ?? { ok: true })

    log('info', {
      msg: `${operation}_done`,
      route,
      method: req.method,
      requestId,
      status: response.status,
      ms: Date.now() - start,
    })

    return response
  } catch (error) {
    log('error', {
      msg: `${operation}_failed`,
      route,
      method: req.method,
      requestId,
      error: serializeError(error),
      ms: Date.now() - start,
    })
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
