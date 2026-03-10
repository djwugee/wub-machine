import * as Sentry from 'sentry-nextjs'

const ENVIRONMENT = process.env.NODE_ENV || 'development'
const SENTRY_DSN = process.env.SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,
    debug: ENVIRONMENT === 'development',
  })
}

export default Sentry
