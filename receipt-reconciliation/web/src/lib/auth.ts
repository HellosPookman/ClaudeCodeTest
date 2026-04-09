"use client";
import Cookies from "js-cookie";
import { auth } from "./api";
import type { User } from "./types";

export async function login(email: string, password: string): Promise<void> {
  const res = await auth.login(email, password);
  Cookies.set("token", res.access_token, { expires: 1, sameSite: "strict" });
}

export function getToken(): string | undefined {
  return Cookies.get("token");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export async function getCurrentUser(): Promise<User | null> {
  if (!isAuthenticated()) return null;
  try {
    return await auth.me();
  } catch {
    Cookies.remove("token");
    return null;
  }
}

export function logout() {
  Cookies.remove("token");
  window.location.href = "/login";
}
