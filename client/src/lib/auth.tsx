import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "./queryClient";
import { getApiUrl } from "./api";

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

// SECURITY: the server still issues a JWT on login/signup (useful for
// non-browser API clients), but the web client intentionally no longer
// stores it in localStorage or attaches it as a Bearer token. localStorage
// is readable by any script on the page, so a JWT kept there is stealable
// by any XSS bug — including ones in third-party dependencies — for the
// token's full 7-day lifetime. The httpOnly, secure session cookie (already
// sent automatically via credentials: "include") is the sole auth mechanism
// for this client, since it can't be read or exfiltrated by JavaScript.
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
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
      }
    } catch (error) {
      // Not logged in
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(data);
  }

  async function signup(email: string, password: string, pin?: string) {
    const data = await apiRequest("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, pin: pin || null }),
    });
    setUser(data);
  }

  async function logout() {
    await apiRequest("/api/auth/logout", {
      method: "POST",
    });
    setUser(null);
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
