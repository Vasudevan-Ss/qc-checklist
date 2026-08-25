import { storage } from "@/src/utils/storage";
import { Platform } from "react-native";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
export const API = `${BASE}/api`;
export const TOKEN_KEY = "qc_auth_token";

async function getToken(): Promise<string | null> {
  return storage.secureGet<string>(TOKEN_KEY, "");
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: any, auth = true) =>
    request<T>(p, { method: "POST", body, auth }),
  put: <T = any>(p: string, body?: any) => request<T>(p, { method: "PUT", body }),
  del: <T = any>(p: string) => request<T>(p, { method: "DELETE" }),

  async uploadPhoto(uri: string): Promise<string> {
    const token = await getToken();
    const name = `photo_${Date.now()}.jpg`;
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("file", blob, name);
    } else {
      // @ts-ignore native multipart shape
      form.append("file", { uri, name, type: "image/jpeg" });
    }
    const res = await fetch(`${API}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) throw new Error("Photo upload failed");
    const data = await res.json();
    return data.path as string;
  },

  async fileUrl(path: string): Promise<string> {
    const token = await getToken();
    return `${API}/files/${path}?token=${encodeURIComponent(token || "")}`;
  },
};
