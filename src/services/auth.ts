import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User, RegisterData } from "../types";

const AUTH_KEY = "@wifizone/auth_session";
const USER_KEY = "@wifizone/user_data";

const DEMO_USER: User = {
  id: "u-001",
  firstName: "Jean",
  lastName: "Dupont",
  email: "jean.dupont@email.com",
  phone: "+33 6 12 34 56 78",
  plan: "free",
  createdAt: "2026-01-15"
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const AuthService = {
  async login(email: string, password: string): Promise<User> {
    await delay(800);
    if (!email || !password) {
      throw new Error("Email et mot de passe requis");
    }
    const user = { ...DEMO_USER, email };
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ email, token: "session-token-" + Date.now() }));
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  },

  async register(data: RegisterData): Promise<User> {
    await delay(1200);
    if (!data.email || !data.password || !data.firstName || !data.lastName) {
      throw new Error("Tous les champs sont requis");
    }
    const user: User = {
      id: "u-" + Date.now(),
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      plan: "free",
      createdAt: new Date().toISOString().split("T")[0]
    };
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ email: data.email, token: "session-token-" + Date.now() }));
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  },

  async logout(): Promise<void> {
    await delay(200);
    await AsyncStorage.removeItem(AUTH_KEY);
  },

  async restoreSession(): Promise<User | null> {
    try {
      const authData = await AsyncStorage.getItem(AUTH_KEY);
      if (!authData) return null;
      const userData = await AsyncStorage.getItem(USER_KEY);
      if (!userData) return null;
      return JSON.parse(userData) as User;
    } catch {
      return null;
    }
  },

  async updateProfile(updates: Partial<User>): Promise<User> {
    await delay(500);
    const userData = await AsyncStorage.getItem(USER_KEY);
    if (!userData) throw new Error("Utilisateur non trouvé");
    const user = { ...JSON.parse(userData) as User, ...updates };
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  },

  async requestPasswordReset(email: string): Promise<void> {
    await delay(1500);
    if (!email) throw new Error("Email requis");
  },

  async verifyEmail(code: string): Promise<void> {
    await delay(1000);
    if (!code || code.length < 4) {
      throw new Error("Code de vérification invalide");
    }
  }
};
