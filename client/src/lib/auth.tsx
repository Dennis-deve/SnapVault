import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "./queryClient";
import { getApiUrl } from "./api";
import { clearAllAlbumUnlockTokens } from "./albumUnlock";

interface User {
  id: string;
  email: string;
  pin: string | null;
  hasPassword?: boolean;
  googleLinked?: boolean;
  publicSharingEnabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, pin?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const response = await fetchWithAuth(getApiUrl("/api/auth/me"));
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else if (response.status === 401) {
        localStorage.removeItem("auth_token");
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (data?.token) {
      localStorage.setItem("auth_token", data.token);
    }
    // Account switch hygiene: nothing cached for the previous account may
    // survive into this one — media, albums, search results, and any
    // album-unlock tokens all belong to whoever was signed in before.
    queryClient.clear();
    clearAllAlbumUnlockTokens();
    setUser(data);
  }

  async function signup(email: string, password: string, pin?: string) {
    const data = await apiRequest("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, pin: pin || null }),
    });
    if (data?.token) {
      localStorage.setItem("auth_token", data.token);
    }
    queryClient.clear();
    clearAllAlbumUnlockTokens();
    setUser(data);
  }

  async function logout() {
    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      localStorage.removeItem("auth_token");
      // Clear the prior account's cached media/albums/searches and its
      // album-unlock tokens, so the next account (or logged-out visitor)
      // never sees any of it.
      queryClient.clear();
      clearAllAlbumUnlockTokens();
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
