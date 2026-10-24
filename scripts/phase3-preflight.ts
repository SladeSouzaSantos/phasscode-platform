import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { loadAuthConfig } from '../packages/shared-config/src/auth.js';
import { loadCalendarConfig } from '../packages/shared-config/src/calendar.js';
import { loadMeetingConfig } from '../packages/shared-config/src/meetings.js';
import { loadWorkerConfig } from '../packages/shared-config/src/worker.js';
import {
  LLM_FALLBACK_ENV_NAMES,
  LLM_FALLBACK_PROVIDER_IDS,
  LLM_FALLBACK_REQUIRED_FIELDS,
  LLM_FALLBACK_PROVIDER_FIELDS,
} from '../packages/shared-config/src/llm-fallback.js';

type Module = 'runtime' | 'auth' | 'meetings' | 'calendar' | 'notifications' | 'worker';
type Target = 'host' | 'compose';
type Severity = 'pending' | 'invalid';
export interface PreflightIssue {
  module: Module;
  severity: Severity;
  code: string;
  variables: string[];
}
export interface PreflightReport {
  status: 'configured_offline' | 'incomplete' | 'invalid';
  exitCode: 0 | 1 | 2;
  target: Target;
  scope: 'process_environment' | 'repository_compose_model';
  effects: 'none';
  externalHomologation: 'not_performed';
  features: {
    auth: 'enabled' | 'disabled' | 'invalid';
    meetings: 'enabled' | 'disabled' | 'invalid';
    calendar: 'disabled' | 'simulated' | 'real' | 'invalid';
    worker: 'enabled' | 'disabled' | 'invalid';
    notifications: 'disabled' | 'simulated' | 'real' | 'invalid';
  };
  issues: PreflightIssue[];
}
export type ComposeEnvironment = Record<string, string | number | boolean>;

const authRequired = [
  'AUTH_PUBLIC_URL',
  'AUTH_FRONTEND_URL',
  'AUTH_GOOGLE_CLIENT_ID',
  'AUTH_GOOGLE_CLIENT_SECRET',
  'AUTH_JWT_KEY_ID',
  'AUTH_JWT_PRIVATE_KEY',
];
const meetingRequired = [
  'MEETINGS_TIMEZONE',
  'MEETINGS_WORKDAYS',
  'MEETINGS_WORK_START',
  'MEETINGS_WORK_END',
  'MEETINGS_DURATION_MINUTES',
  'MEETINGS_MIN_NOTICE_MINUTES',
  'MEETINGS_BUFFER_MINUTES',
  'MEETINGS_MAX_HORIZON_DAYS',
];
const calendarRequired = [
  'GOOGLE_CALENDAR_ID',
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_CALENDAR_REFRESH_TOKEN',
];
const knownVariables = [
  'NODE_ENV',
  'PHASSCODE_NODE_ENV',
  'HOST',
  'PORT',
  'LOG_LEVEL',
  'PERSISTENCE',
  'DATABASE_URL',
  'REDIS_URL',
  'POSTGRES_PASSWORD',
  'CORS_ORIGINS',
  'TRUST_PROXY',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_WINDOW_MS',
  'CHAT_HISTORY_MESSAGES',
  'CHAT_CONTEXT_CHARS',
  'CHAT_RETENTION_DAYS',
  'CHAT_MAX_CONVERSATIONS',
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_API_MODE',
  'OPENROUTER_REASONING_ENABLED',
  'LLM_TIMEOUT_MS',
  'LLM_MAX_OUTPUT_TOKENS',
  'LLM_GLOBAL_MAX_CALLS',
  'LLM_GLOBAL_WINDOW_MS',
  'LLM_GLOBAL_BUDGET_KEY',
  ...LLM_FALLBACK_ENV_NAMES,
  'LANGCHAIN_VERBOSE',
  'LANGCHAIN_TRACING',
  'LANGCHAIN_TRACING_V2',
  'LANGSMITH_TRACING',
  'LANGSMITH_TRACING_V2',
  'AUTH_ENABLED',
  ...authRequired,
  'AUTH_GOOGLE_ISSUER',
  'AUTH_JWT_ISSUER',
  'AUTH_JWT_AUDIENCE',
  'AUTH_JWT_PREVIOUS_JWKS',
  'AUTH_COOKIE_SECURE',
  'AUTH_ACCESS_TTL_SECONDS',
  'AUTH_SESSION_TTL_SECONDS',
  'AUTH_SESSION_MAX_SECONDS',
  'AUTH_HTTP_TIMEOUT_SECONDS',
  'MEETINGS_ENABLED',
  ...meetingRequired,
  'MEETINGS_SLOT_STEP_MINUTES',
  'MEETINGS_MAX_AVAILABILITY_DAYS',
  'MEETINGS_CONSENT_VERSION',
  'MEETINGS_RETENTION_DAYS',
  'MEETINGS_PROPOSAL_TTL_MINUTES',
  'MEETINGS_CALENDAR_LEASE_SECONDS',
  'GOOGLE_CALENDAR_MODE',
  ...calendarRequired,
  'GOOGLE_CALENDAR_HTTP_TIMEOUT_MS',
  'WORKER_ENABLED',
  'NOTIFICATION_MODE',
  'SMTP_HOST',
  'SMTP_FROM',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'NOTIFICATION_HTTP_TIMEOUT_MS',
  'OUTBOX_POLL_MS',
  'OUTBOX_LEASE_MS',
  'OUTBOX_MAX_ATTEMPTS',
  'REMINDER_BEFORE_MINUTES',
];
const present = (env: NodeJS.ProcessEnv, name: string) => !!env[name]?.trim();

// Read only the repository template, never a .env, secret file, Docker daemon or provider.
export function readRepositoryComposeEnvironment(): ComposeEnvironment {
  const document: unknown = parse(
    readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8'),
    { logLevel: 'silent' },
  );
  if (!document || typeof document !== 'object' || !('x-app' in document))
    throw new Error('COMPOSE_TEMPLATE_INVALID');
  const app = document['x-app'];
  if (!app || typeof app !== 'object' || !('environment' in app))
    throw new Error('COMPOSE_TEMPLATE_INVALID');
  const environment = app.environment;
  if (!environment || typeof environment !== 'object' || Array.isArray(environment))
    throw new Error('COMPOSE_TEMPLATE_INVALID');
  for (const [name, value] of Object.entries(environment)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !['string', 'number', 'boolean'].includes(typeof value))
      throw new Error('COMPOSE_TEMPLATE_INVALID');
  }
  return environment as ComposeEnvironment;
}

export function inspectPhase3Environment(
  input: NodeJS.ProcessEnv,
  options: { target?: Target; composeEnvironment?: ComposeEnvironment } = {},
): PreflightReport {
  const target = options.target ?? 'host';
  const issues: PreflightIssue[] = [];
  const add = (module: Module, severity: Severity, code: string, variables: string[]) => {
    const safe = [...new Set(variables.filter((name) => knownVariables.includes(name)))].sort();
    if (
      !issues.some(
        (issue) =>
          issue.module === module && issue.code === code && issue.variables.join() === safe.join(),
      )
    )
      issues.push({ module, severity, code, variables: safe });
  };
  let env = { ...input };
  if (target === 'compose') {
    if (!options.composeEnvironment) throw new Error('COMPOSE_TEMPLATE_REQUIRED');
    env = {};
    for (const [name, template] of Object.entries(options.composeEnvironment)) {
      if (
        String(template).includes('$$') ||
        /\$\{[^}]*\$\{/.test(String(template)) ||
        String(template)
          .replace(/\$\{([A-Z][A-Z0-9_]*)(?::([-?])([^}]*))?\}/g, '')
          .includes('${')
      )
        throw new Error('COMPOSE_INTERPOLATION_UNSUPPORTED');
      env[name] = String(template).replace(
        /\$\{([A-Z][A-Z0-9_]*)(?::([-?])([^}]*))?\}/g,
        (
          _match: string,
          variable: string,
          operator: string | undefined,
          fallback: string | undefined,
        ) => {
          if (input[variable]) return input[variable]!;
          if (operator === '-') return fallback ?? '';
          if (operator === '?')
            add('runtime', 'pending', 'COMPOSE_REQUIRED_VARIABLE_MISSING', [variable]);
          return '';
        },
      );
    }
  }
  const booleanFeature = (name: string): 'enabled' | 'disabled' | 'invalid' => {
    if (env[name] === 'true') return 'enabled';
    if (!env[name] || env[name] === 'false') return 'disabled';
    return 'invalid';
  };
  const modeFeature = (
    name: string,
    real: string,
  ): 'disabled' | 'simulated' | 'real' | 'invalid' => {
    if (!env[name] || env[name] === 'disabled') return 'disabled';
    if (env[name] === 'fake') return 'simulated';
    if (env[name] === real) return 'real';
    return 'invalid';
  };
  const features: PreflightReport['features'] = {
    auth: booleanFeature('AUTH_ENABLED'),
    meetings: booleanFeature('MEETINGS_ENABLED'),
    calendar: modeFeature('GOOGLE_CALENDAR_MODE', 'google'),
    worker: booleanFeature('WORKER_ENABLED'),
    notifications: modeFeature('NOTIFICATION_MODE', 'real'),
  };
  const missing = new Set<string>();
  const requireValues = (module: Module, variables: string[]) => {
    const absent = variables.filter((name) => !present(env, name));
    absent.forEach((name) => missing.add(name));
    if (absent.length) add(module, 'pending', 'REQUIRED_VARIABLES_MISSING', absent);
  };
  const requireFeature = (module: Module, variable: string, status: string) => {
    if (status === 'invalid') add(module, 'invalid', 'FEATURE_VALUE_INVALID', [variable]);
    else if (!['enabled', 'real'].includes(status)) {
      missing.add(variable);
      add(module, 'pending', status === 'simulated' ? 'FEATURE_SIMULATED' : 'FEATURE_DISABLED', [
        variable,
      ]);
    }
  };
  requireFeature('auth', 'AUTH_ENABLED', features.auth);
  requireFeature('meetings', 'MEETINGS_ENABLED', features.meetings);
  requireFeature('calendar', 'GOOGLE_CALENDAR_MODE', features.calendar);
  requireFeature('worker', 'WORKER_ENABLED', features.worker);
  requireFeature('notifications', 'NOTIFICATION_MODE', features.notifications);
  if (env.NODE_ENV === 'production') {
    if (features.calendar === 'simulated')
      add('calendar', 'invalid', 'SIMULATION_FORBIDDEN_IN_PRODUCTION', ['GOOGLE_CALENDAR_MODE']);
    if (features.notifications === 'simulated')
      add('notifications', 'invalid', 'SIMULATION_FORBIDDEN_IN_PRODUCTION', ['NOTIFICATION_MODE']);
  }
  if (env.PERSISTENCE !== 'postgres') {
    missing.add('PERSISTENCE');
    add(
      'runtime',
      ['memory', undefined, ''].includes(env.PERSISTENCE) ? 'pending' : 'invalid',
      'POSTGRES_REQUIRED',
      ['PERSISTENCE'],
    );
  }
  requireValues('runtime', ['DATABASE_URL', 'REDIS_URL']);
  if (env.LLM_FALLBACK_ENABLED === 'true') {
    requireValues('runtime', ['LLM_GLOBAL_MAX_CALLS']);
    let providers = 0;
    for (const id of LLM_FALLBACK_PROVIDER_IDS) {
      const prefix = `LLM_${id.toUpperCase()}_`;
      const required = LLM_FALLBACK_REQUIRED_FIELDS.map((suffix) => prefix + suffix);
      if (LLM_FALLBACK_PROVIDER_FIELDS.some((suffix) => present(env, prefix + suffix))) {
        providers++;
        requireValues('runtime', required);
      }
    }
    if (!providers) {
      const candidates = LLM_FALLBACK_PROVIDER_IDS.flatMap((id) =>
        LLM_FALLBACK_REQUIRED_FIELDS.map((suffix) => `LLM_${id.toUpperCase()}_${suffix}`),
      );
      candidates.forEach((name) => missing.add(name));
      add('runtime', 'pending', 'FALLBACK_PROVIDER_REQUIRED', candidates);
    }
  } else if (['openai', 'openai-compatible'].includes(env.LLM_PROVIDER ?? '')) {
    requireValues('runtime', ['LLM_API_KEY', 'LLM_MODEL', 'LLM_GLOBAL_MAX_CALLS']);
    if (env.LLM_PROVIDER === 'openai-compatible') requireValues('runtime', ['LLM_BASE_URL']);
  }
  requireValues('auth', authRequired);
  requireValues('meetings', meetingRequired);
  requireValues('calendar', calendarRequired);
  if (
    !(present(env, 'SMTP_HOST') && present(env, 'SMTP_FROM')) &&
    !(present(env, 'TELEGRAM_BOT_TOKEN') && present(env, 'TELEGRAM_CHAT_ID'))
  ) {
    ['SMTP_HOST', 'SMTP_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']
      .filter((name) => !present(env, name))
      .forEach((name) => missing.add(name));
    add('notifications', 'pending', 'CONFIGURE_AT_LEAST_ONE_CHANNEL', [
      'SMTP_HOST',
      'SMTP_FROM',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID',
    ]);
  }
  for (const pair of [
    ['SMTP_HOST', 'SMTP_FROM'],
    ['SMTP_USER', 'SMTP_PASSWORD'],
    ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
  ]) {
    if (pair.some((name) => present(env, name)) && !pair.every((name) => present(env, name)))
      requireValues('notifications', pair);
  }
  const check = (module: Module, loader: () => unknown, fallback: string[]) => {
    try {
      loader();
    } catch (error) {
      // Match only a fixed allowlist of field names. Never return an exception or a value.
      const message = error instanceof Error ? error.message : '';
      const named = knownVariables.filter((name) =>
        new RegExp(`(^|[^A-Z0-9_])${name}($|[^A-Z0-9_])`).test(message),
      );
      const semantic: [string, string[]][] = [
        ['URLs de autenticação exigem', ['AUTH_PUBLIC_URL', 'AUTH_FRONTEND_URL']],
        ['Cookie sem Secure', ['AUTH_COOKIE_SECURE', 'AUTH_PUBLIC_URL', 'AUTH_FRONTEND_URL']],
        [
          'Tempos de acesso/sessão',
          ['AUTH_ACCESS_TTL_SECONDS', 'AUTH_SESSION_TTL_SECONDS', 'AUTH_SESSION_MAX_SECONDS'],
        ],
        ['único provedor habilitado', ['AUTH_GOOGLE_ISSUER']],
        [
          'Expediente de reuniões',
          ['MEETINGS_WORK_START', 'MEETINGS_WORK_END', 'MEETINGS_DURATION_MINUTES'],
        ],
        [
          'Credenciais parciais de notificações',
          [
            'SMTP_HOST',
            'SMTP_FROM',
            'SMTP_USER',
            'SMTP_PASSWORD',
            'TELEGRAM_BOT_TOKEN',
            'TELEGRAM_CHAT_ID',
          ].filter((name) => missing.has(name)),
        ],
        [
          'Notificações reais requerem',
          ['SMTP_HOST', 'SMTP_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].filter((name) =>
            missing.has(name),
          ),
        ],
        ['Worker em produção requer', ['GOOGLE_CALENDAR_MODE', 'NOTIFICATION_MODE']],
        ['Reuniões habilitadas requerem', ['AUTH_ENABLED', 'GOOGLE_CALENDAR_MODE']],
        ['Worker requer reuniões', ['MEETINGS_ENABLED']],
        [
          'seis timeouts HTTP',
          ['MEETINGS_CALENDAR_LEASE_SECONDS', 'GOOGLE_CALENDAR_HTTP_TIMEOUT_MS'],
        ],
      ];
      const meaning = semantic.find(([fragment]) => message.includes(fragment))?.[1];
      const fallbackMissing = fallback.filter((name) => missing.has(name));
      const missingNamed = named.filter((name) => missing.has(name));
      const requiredFailure = /obrigatóri| requer|exigem|exige/.test(message);
      const variables = named.length
        ? requiredFailure && missingNamed.length
          ? missingNamed
          : named
        : (meaning ?? (fallbackMissing.length ? fallbackMissing : fallback));
      const incomplete = variables.length > 0 && variables.every((name) => missing.has(name));
      add(
        module,
        incomplete ? 'pending' : 'invalid',
        incomplete ? 'CONFIGURATION_INCOMPLETE' : 'CONFIGURATION_INVALID',
        variables,
      );
    }
  };
  check('auth', () => loadAuthConfig(env), ['PERSISTENCE', 'DATABASE_URL']);
  check('meetings', () => loadMeetingConfig(env), meetingRequired);
  check('calendar', () => loadCalendarConfig(env), calendarRequired);
  check('worker', () => loadWorkerConfig(env), [
    'DATABASE_URL',
    'REDIS_URL',
    'WORKER_ENABLED',
    'GOOGLE_CALENDAR_MODE',
    'NOTIFICATION_MODE',
  ]);
  // Full application validation also checks CORS, privacy flags, provider budget and cross-module rules.
  check('runtime', () => loadConfig(env), [...missing]);
  const invalid = issues.some((issue) => issue.severity === 'invalid');
  const status = invalid ? 'invalid' : issues.length ? 'incomplete' : 'configured_offline';
  return {
    status,
    exitCode: invalid ? 1 : issues.length ? 2 : 0,
    target,
    scope: target === 'host' ? 'process_environment' : 'repository_compose_model',
    effects: 'none',
    externalHomologation: 'not_performed',
    features,
    issues,
  };
}

export function runPhase3Preflight(
  args: string[],
  env: NodeJS.ProcessEnv,
  compose: () => ComposeEnvironment = readRepositoryComposeEnvironment,
): { exitCode: number; output: string } {
  if (args.includes('--help') && args.length === 1)
    return {
      exitCode: 0,
      output:
        'Uso: npm run phase3:preflight -- [--target=host|compose] [--json]\nSem rede, banco, worker, migrations ou leitura automática de .env. Configuração não comprova homologação.',
    };
  const targetArgs = args.filter((arg) => arg.startsWith('--target='));
  if (
    targetArgs.length > 1 ||
    args.filter((arg) => arg === '--json').length > 1 ||
    args.some((arg) => !['--json', '--target=host', '--target=compose'].includes(arg))
  )
    return {
      exitCode: 1,
      output: '{"status":"invalid","code":"PREFLIGHT_ARGUMENT_INVALID","effects":"none"}',
    };
  const target = args.includes('--target=compose') ? 'compose' : 'host';
  try {
    const report = inspectPhase3Environment(env, {
      target,
      ...(target === 'compose' ? { composeEnvironment: compose() } : {}),
    });
    return {
      exitCode: report.exitCode,
      output: args.includes('--json')
        ? JSON.stringify(report, null, 2)
        : [
            `Fase 3: ${report.status}; alvo: ${report.target}; somente configuração offline.`,
            'Nenhuma homologação externa realizada; nenhum valor de configuração é exibido.',
            ...report.issues.map(
              (issue) =>
                `${issue.severity} ${issue.module} ${issue.code}: ${issue.variables.join(', ')}`,
            ),
          ].join('\n'),
    };
  } catch {
    return {
      exitCode: 1,
      output: '{"status":"invalid","code":"PREFLIGHT_INTERNAL_ERROR","effects":"none"}',
    };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runPhase3Preflight(process.argv.slice(2), process.env);
  console.info(result.output);
  process.exitCode = result.exitCode;
}
