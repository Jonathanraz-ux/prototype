import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSupabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import type { User, RegisterData } from "../types";

const TAG = "auth";
const DEMO_STORAGE_KEY = "@wifizone/demo_user_session";
const DEMO_EMAIL = "demo@wifizone.app";
const isDemoNetworkMode = () =>
  (process.env.EXPO_PUBLIC_NETWORK_MODE ?? "") === "android_vpn_demo";

let _cachedAccessToken: string | null = null;

export function getAccessToken(): string | null {
  if (_cachedAccessToken) {
    try {
      const [, payloadB64] = _cachedAccessToken.split(".");
      if (payloadB64) {
        let pad = payloadB64;
        while (pad.length % 4 !== 0) pad += "=";
        const payload = JSON.parse(
          decodeURIComponent(
            Array.prototype.map
              .call(
                atob(pad.replace(/-/g, "+").replace(/_/g, "/")),
                (c: string) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")
              )
              .join("")
          )
        );
        const ttlSec = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
        if (ttlSec <= 300) {
          _cachedAccessToken = null;
        }
      }
    } catch {
      _cachedAccessToken = null;
    }
  }
  return _cachedAccessToken;
}

function profileFallback(data: { id: string; email?: string }): User {
  return {
    id: data.id,
    organizationId: "",
    firstName: data.email?.split("@")[0] ?? "Utilisateur",
    lastName: "",
    fullName: data.email ?? "",
    email: data.email ?? "",
    phone: "",
    role: "user",
    status: "active",
    createdAt: new Date().toISOString(),
  };
}

function mapProfileToUser(row: {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
}): User {
  return {
    id: row.id,
    organizationId: row.organization_id ?? "",
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    role: row.role as User["role"],
    status: row.status as User["status"],
    createdAt: row.created_at,
  };
}

async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    logger.warn(TAG, "Échec de récupération du profil", error.message);
    return null;
  }
  if (!data) return null;
  return mapProfileToUser(data);
}

export const AuthService = {
  async getSession() {
    // Mode démonstration Android : établir une session RÉELLE sur le compte
    // démo à CHAQUE démarrage pour que les Edge Functions et RPCs (quota,
    // publicité, session) acceptent le jeton. La persistance du client
    // Supabase étant peu fiable sur l'appareil, on ne s'appuie jamais sur une
    // session stockée : un jeton frais garanti (JWT valide) élimine les 401
    // et les conclusions NETWORK_LOST erronées.
    const demoPassword = (process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? "").trim();
    if (isDemoNetworkMode() && demoPassword) {
      try {
        const signed = await Promise.race([
          getSupabase().auth.signInWithPassword({
            email: DEMO_EMAIL,
            password: demoPassword,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 10000)
          ),
        ]);
        if (!signed.error && signed.data.session) {
          _cachedAccessToken = signed.data.session.access_token;
          await AsyncStorage.removeItem(DEMO_STORAGE_KEY);
          logger.info(TAG, "Session démo réelle établie");
          return signed.data.session;
        }
        if (signed.error) {
          logger.warn(TAG, "Connexion démo refusée", signed.error.message);
        }
      } catch (e) {
        // Hors-ligne ou indisponible : on retombe sur la session stockée.
        logger.warn(TAG, "Connexion démo impossible", e);
      }
    } else {
      try {
        const { data } = await getSupabase().auth.getSession();
        if (data.session) return data.session;
      } catch {
        // Ignorer erreur réseau en mode démo
      }
    }

    return null;
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      const {
        data: { user },
      } = await getSupabase().auth.getUser();
      if (user) {
        const profile = await fetchProfile(user.id);
        if (profile) return profile;
        // Utilisateur RÉELLEMENT authentifié sans profil : profil minimal
        // réel (jamais d'identité démo fabriquée, AUCUN fichier stocké).
        return profileFallback(user);
      }
    } catch {
      // Ignorer erreur réseau en mode démo
    }
    // Aucune session RÉELLE → aucun utilisateur. La version v5 renvoyait ici
    // une session « démo » stockée localement (sans JWT) : ce contournement
    // est supprimé. L'authentification passe exclusivement par le back-end.
    return null;
  },

  /**
   * Inscription réelle via Supabase Auth.
   * Après inscription, crée/actualise le profil dans la table profiles.
   */
  async signUp(data: RegisterData): Promise<User> {
    const supabase = getSupabase();

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          first_name: data.firstName,
          last_name: data.lastName,
          full_name: `${data.firstName} ${data.lastName}`.trim(),
          phone: data.phone,
        },
      },
    });

    if (error) {
      logger.warn(TAG, "Échec inscription", error.message);
      throw new Error(translateAuthError(error.message));
    }

    const userId = authData.user?.id;
    if (!userId) {
      throw new Error("Impossible de créer le compte.");
    }

    // Upsert du profil
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          first_name: data.firstName,
          last_name: data.lastName,
          full_name: `${data.firstName} ${data.lastName}`.trim(),
          email: data.email,
          phone: data.phone || null,
          role: "user",
          status: "pending",
        },
        { onConflict: "id" }
      );

    if (profileError) {
      logger.warn(TAG, "Échec création profil", profileError.message);
    }

    return (await fetchProfile(userId)) ?? {
      id: userId,
      organizationId: "",
      firstName: data.firstName,
      lastName: data.lastName,
      fullName: `${data.firstName} ${data.lastName}`.trim(),
      email: data.email,
      phone: data.phone,
      role: "user",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
  },

  /**
   * Connexion via Supabase Auth UNIQUEMENT. Aucune session locale
   * artificielle : un mot de passe invalide (même pour les emails
   * demo@/test@) est REFUSÉ avec une erreur traduite. Les comptes démo
   * sont de vrais comptes (authentifiés par le back-end), jamais créés
   * silencieusement côté client.
   */
  async signIn(email: string, password: string): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    const normalizedEmail = cleanEmail.includes("@")
      ? cleanEmail
      : `${cleanEmail}@wifizone.app`;

    const { data, error } = await getSupabase().auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      logger.warn(TAG, "Échec connexion", error.message);
      throw new Error(translateAuthError(error.message));
    }

    if (!data.user) {
      throw new Error("Impossible de se connecter.");
    }

    _cachedAccessToken = data.session?.access_token ?? null;
    await AsyncStorage.removeItem(DEMO_STORAGE_KEY);
    const profile = await fetchProfile(data.user.id);
    if (profile) return profile;
    // Compte authentifié sans profil : profil minimal RÉEL (aucune identité
    // démo fabriquée, aucun rôle privilégié inventé).
    return profileFallback(data.user);
  },

  /**
   * Déconnexion réelle.
   */
  async signOut(): Promise<void> {
    await AsyncStorage.removeItem(DEMO_STORAGE_KEY);
    try {
      const { error } = await getSupabase().auth.signOut();
      if (error) {
        logger.warn(TAG, "Échec déconnexion", error.message);
      }
    } catch {
      // Ignorer erreur réseau
    }
  },

  /**
   * Mot de passe oublié (lien de réinitialisation).
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email);
    if (error) {
      logger.warn(TAG, "Échec reset lien", error.message);
      throw new Error(translateAuthError(error.message));
    }
  },

  /**
   * Mise à jour du profil.
   */
  async updateProfile(updates: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): Promise<User> {
    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Non connecté.");

    const fullName = `${updates.firstName ?? ""} ${updates.lastName ?? ""}`.trim();

    const { data, error } = await supabase
      .from("profiles")
      .update({
        ...(updates.firstName !== undefined ? { first_name: updates.firstName } : {}),
        ...(updates.lastName !== undefined ? { last_name: updates.lastName } : {}),
        ...(fullName ? { full_name: fullName } : {}),
        ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
      })
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) {
      logger.warn(TAG, "Échec maj profil", error.message);
      throw new Error("Impossible de mettre à jour le profil.");
    }
    return mapProfileToUser(data);
  },
};

function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (lower.includes("email not confirmed")) return "Veuillez confirmer votre email avant de vous connecter.";
  if (lower.includes("user already registered")) return "Un compte existe déjà avec cet email.";
  if (lower.includes("password should be at least")) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (lower.includes("user not found")) return "Aucun compte trouvé avec cet email.";
  if (lower.includes("rate limit")) return "Trop de tentatives. Réessayez plus tard.";
  return "Une erreur est survenue. Réessayez.";
}
