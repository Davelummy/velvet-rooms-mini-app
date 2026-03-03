function readInitDataFromSources() {
  if (typeof window === "undefined") {
    return "";
  }

  const fromTelegram = window.Telegram?.WebApp?.initData || "";
  if (fromTelegram) {
    try {
      window.localStorage.setItem("vr_init_data", fromTelegram);
    } catch {
      // ignore storage write failures
    }
    return fromTelegram;
  }

  try {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const fromUrl = search.get("tgWebAppData") || hash.get("tgWebAppData") || "";
    if (fromUrl) {
      window.localStorage.setItem("vr_init_data", fromUrl);
      return fromUrl;
    }
  } catch {
    // ignore URL parse issues
  }

  try {
    return window.localStorage.getItem("vr_init_data") || "";
  } catch {
    return "";
  }
}

async function resolveInitData(waitMs = 900) {
  let initData = readInitDataFromSources();
  if (initData || typeof window === "undefined") {
    return initData;
  }

  const startedAt = Date.now();
  while (!initData && Date.now() - startedAt < waitMs) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    initData = readInitDataFromSources();
  }

  return initData;
}

export async function apiRequest(path, options = {}) {
  const initData = await resolveInitData();
  const headers = {
    "Content-Type": "application/json",
    ...(initData ? { "x-telegram-init": initData } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = { message: await res.text() };
  }

  if (!res.ok) {
    if (res.status === 401 && !options.__retried) {
      const refreshed = readInitDataFromSources();
      if (refreshed && refreshed !== initData) {
        return apiRequest(path, { ...options, __retried: true });
      }
    }
    const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  get: (path, params) => {
    const url = params
      ? `${path}?${new URLSearchParams(params).toString()}`
      : path;
    return apiRequest(url, { method: "GET" });
  },
  post: (path, body) => apiRequest(path, { method: "POST", body }),
  put: (path, body) => apiRequest(path, { method: "PUT", body }),
  patch: (path, body) => apiRequest(path, { method: "PATCH", body }),
  delete: (path) => apiRequest(path, { method: "DELETE" }),
};
