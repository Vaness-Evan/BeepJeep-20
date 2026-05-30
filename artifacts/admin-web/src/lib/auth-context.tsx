import React, { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { setBaseUrl, setAuthTokenGetter, getMe, login as apiLogin } from "@workspace/api-client-react";
import type { AuthUser, LoginInput } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

setBaseUrl("/api");

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: (reason?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("bj_token"));
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (token) {
      setAuthTokenGetter(() => token);
      getMe()
        .then((res) => {
          if (res.user.role !== "admin") {
            throw new Error("This portal is for admins only.");
          }
          setUser(res.user);
        })
        .catch(() => {
          localStorage.removeItem("bj_token");
          setToken(null);
          setAuthTokenGetter(null);
          setLocation("/login");
        })
        .finally(() => setIsLoading(false));
    } else {
      setAuthTokenGetter(null);
      setIsLoading(false);
    }
  }, [token]);

  const login = async (input: LoginInput) => {
    try {
      const res = await apiLogin(input);
      if (res.user.role !== "admin") {
        throw new Error("This portal is for admins only.");
      }
      localStorage.setItem("bj_token", res.token);
      setAuthTokenGetter(() => res.token);
      setToken(res.token);
      setUser(res.user);
      setLocation("/dashboard");
      toast({ title: "Signed in", description: `Welcome back, ${res.user.name}` });
    } catch (err: any) {
      const msg =
        err?.data?.error ?? err?.message ?? "Login failed. Please check your credentials.";
      toast({ title: "Login failed", description: msg, variant: "destructive" });
      throw err;
    }
  };

  const logout = (reason?: string) => {
    localStorage.removeItem("bj_token");
    setToken(null);
    setUser(null);
    setAuthTokenGetter(null);
    setLocation("/login");
    if (reason) {
      toast({ title: "Signed out", description: reason, variant: "destructive" });
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
