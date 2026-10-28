import {
  BubbleContractError,
  prepareBubbleDtc,
  prepareBubbleGps,
  prepareBubbleHeartbeat,
  prepareBubblePidSupport,
  prepareBubbleReading,
  prepareBubbleTrip,
  unwrapBubbleResponse,
  type BubbleConnectionState,
  type BubbleDtcDraft,
  type BubbleGpsDraft,
  type BubbleReadingDraft,
  type BubbleTripDraft,
} from './bubbleWorkflowContract';

export interface BubbleClientOptions {
  fetcher?: typeof fetch;
  now?: () => number;
}

export interface BubbleLoginResult {
  authenticated: true;
  userId?: string;
}

export class BubbleWorkflowError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false, httpStatus?: number) {
    super(message);
    this.name = 'BubbleWorkflowError';
    this.code = code;
    this.retryable = retryable;
    if (httpStatus != null) this.httpStatus = httpStatus;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeApiBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BubbleWorkflowError('INVALID_BASE_URL', 'A URL base do Bubble é inválida.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new BubbleWorkflowError('HTTPS_REQUIRED', 'A integração Bubble aceita apenas HTTPS sem credenciais embutidas.');
  }
  const pathname = parsed.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/api/1.1/wf')) {
    throw new BubbleWorkflowError('INVALID_WORKFLOW_BASE', 'Informe a base terminada em /api/1.1/wf.');
  }
  return parsed.origin + pathname;
}

function getTokenFromResponse(value: unknown): string | null {
  const data = unwrapBubbleResponse(value);
  if (!isRecord(data)) return null;
  const token = typeof data.token === 'string'
    ? data.token
    : typeof data.access_token === 'string'
      ? data.access_token
      : null;
  return token != null && token.trim().length > 0 ? token.trim() : null;
}

export class BubbleWorkflowClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private accessToken: string | null = null;
  private readonly lastReadingAttemptAt = new Map<string, number>();

  constructor(baseUrl: string, options: BubbleClientOptions = {}) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  get isAuthenticated(): boolean {
    return this.accessToken != null;
  }

  /**
   * The token remains in memory only. The native caller must persist it, if
   * needed, through Android Keystore/SecureStore and restore via setAccessToken.
   */
  async login(email: string, password: string): Promise<BubbleLoginResult> {
    if (typeof email !== 'string' || email.trim().length === 0 ||
        typeof password !== 'string' || password.length === 0) {
      throw new BubbleWorkflowError('INVALID_CREDENTIALS', 'E-mail e senha são obrigatórios.');
    }
    const result = await this.post('v1_login', {
      email: email.trim(),
      password,
    }, false);
    const token = getTokenFromResponse(result);
    if (token == null) {
      throw new BubbleWorkflowError('LOGIN_TOKEN_MISSING', 'O workflow de login não retornou token de usuário.');
    }
    this.accessToken = token;
    const data = unwrapBubbleResponse(result);
    const userId = isRecord(data) && typeof data.user_id === 'string' ? data.user_id : undefined;
    return { authenticated: true, ...(userId == null ? {} : { userId }) };
  }

  setAccessToken(token: string | null): void {
    if (token == null) {
      this.accessToken = null;
      return;
    }
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new BubbleWorkflowError('INVALID_ACCESS_TOKEN', 'Token de usuário inválido.');
    }
    this.accessToken = token.trim();
  }

  clearSession(): void {
    this.accessToken = null;
    this.lastReadingAttemptAt.clear();
  }

  async sendReading(draft: BubbleReadingDraft): Promise<unknown> {
    const payload = prepareBubbleReading(draft, this.now());
    const key = payload.device + ':' + payload.pid;
    const currentAttempt = this.now();
    const previousAttempt = this.lastReadingAttemptAt.get(key);
    if (previousAttempt != null && currentAttempt - previousAttempt < 1000) {
      throw new BubbleContractError('READING_RATE_LIMITED', 'Limite local: aguarde 1 segundo antes de enviar o mesmo PID.');
    }
    // Record before networking: if the response is lost after the server
    // accepted the request, an immediate retry could hit the server throttle.
    this.lastReadingAttemptAt.set(key, currentAttempt);
    return this.post('v1_reading', payload, true);
  }

  async sendGps(draft: BubbleGpsDraft): Promise<unknown> {
    return this.post('v1_gps', prepareBubbleGps(draft, this.now()), true);
  }

  async sendTrip(draft: BubbleTripDraft): Promise<unknown> {
    return this.post('v1_trip', prepareBubbleTrip(draft), true);
  }

  async sendDtc(draft: BubbleDtcDraft): Promise<unknown> {
    return this.post('v1_dtc', prepareBubbleDtc(draft), true);
  }

  async declarePidSupport(deviceId: string, pid: string, supported: boolean): Promise<unknown> {
    return this.post('v1_support', prepareBubblePidSupport(deviceId, pid, supported), true);
  }

  async heartbeat(
    deviceId: string,
    connection: BubbleConnectionState,
    signal: number,
    firmware: string,
  ): Promise<unknown> {
    return this.post('v1_heartbeat', prepareBubbleHeartbeat(deviceId, connection, signal, firmware), true);
  }

  private async post(endpoint: string, payload: unknown, authenticated: boolean): Promise<unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (authenticated) {
      if (this.accessToken == null) {
        throw new BubbleWorkflowError('AUTH_REQUIRED', 'Faça login no Bubble antes de sincronizar.', false);
      }
      headers.Authorization = 'Bearer ' + this.accessToken;
    }

    let response: Response;
    try {
      response = await this.fetcher(this.baseUrl + '/' + endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch {
      throw new BubbleWorkflowError('NETWORK_UNAVAILABLE', 'Não foi possível alcançar o backend Bubble.', true);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BubbleWorkflowError('INVALID_RESPONSE', 'O backend Bubble não retornou JSON válido.', response.status >= 500, response.status);
    }

    const outer = isRecord(body) ? body : null;
    if (!response.ok || outer?.status === 'error') {
      const reason = outer != null && typeof outer.message === 'string'
        ? outer.message
        : 'A solicitação ao backend Bubble foi rejeitada.';
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new BubbleWorkflowError('HTTP_' + response.status, reason, retryable, response.status);
    }

    return unwrapBubbleResponse(body);
  }
}
