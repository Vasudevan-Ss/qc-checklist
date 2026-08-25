import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY } from "@/src/api/client";

export type Role = "qc_executive" | "admin";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  active?: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    const token = await storage.secureGet<string>(TOKEN_KEY, "");
    if (token) {
      try {
        const me = await api.get<User>("/auth/me");
        setUser(me);
      } catch {
        await storage.secureRemove(TOKEN_KEY);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = async (email: string, password: string) => {
    const data = await api.post<{ access_token: string; user: User }>(
      "/auth/login",
      { email, password },
      false,
    );
    await storage.secureSet(TOKEN_KEY, data.access_token);
    setUser(data.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const data = await api.post<{ access_token: string; user: User }>(
      "/auth/register",
      { name, email, password },
      false,
    );
    await storage.secureSet(TOKEN_KEY, data.access_token);
    setUser(data.user);
  };

  const logout = async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, isAdmin: user?.role === "admin" }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
