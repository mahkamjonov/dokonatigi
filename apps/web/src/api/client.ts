const TOKEN_KEY = 'microstore_token';
const ACTIVE_STORE_KEY = 'activeStoreId';

const read = (key: string): string => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

export const getToken = () => read(TOKEN_KEY);
export const setToken = (token: string) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
};
export const getActiveStoreId = () => read(ACTIVE_STORE_KEY);

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Network failures, server errors and rate limiting are worth retrying later; validation/permission errors are not.
export const isRetryableError = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500);

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  storeId?: string;
  headers?: Record<string, string>;
  // false for login: no token is sent and a 401 does not log the user out.
  auth?: boolean;
}

const errorMessage = (data: any, status: number): string => {
  const fromBody =
    data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : '');
  if (fromBody) return String(fromBody);
  if (status === 401) return 'Sessiya tugagan. Qayta kiring.';
  if (status === 403) return "Bu amal uchun ruxsat yo'q.";
  if (status === 429) return "Juda ko'p so'rov. Birozdan keyin urinib ko'ring.";
  if (status >= 500) return "Server xatosi. Keyinroq urinib ko'ring.";
  return "So'rovni bajarib bo'lmadi.";
};

export async function apiFetch<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true } = options;
  const token = auth ? getToken() : '';
  const storeId = options.storeId ?? (auth ? getActiveStoreId() : '');

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(storeId ? { 'X-Store-Id': storeId } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Server bilan aloqa o'rnatib bo'lmadi. Internetni tekshiring.", 0);
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {}

  if (response.status === 401 && token && onUnauthorized) {
    onUnauthorized();
  }

  if (!response.ok || data?.success === false) {
    throw new ApiError(errorMessage(data, response.status), response.status, data?.error?.code);
  }

  return data as T;
}
