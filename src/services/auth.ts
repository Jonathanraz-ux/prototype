import { getSupabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import type { User, RegisterData } from "../types";

const TAG = "auth";

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
    const { data } = await getSupabase().auth.getSession();
    return data.session;
  },

  async getCurrentUser(): Promise<User | null> {
    const {
      data: { user },
    } = await getSupabase().auth.getUser();
    if (!user) return null;
    return fetchProfile(user.id);
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
   * Connexion réelle via Supabase Auth.
   */
  async signIn(email: string, password: string): Promise<User> {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.warn(TAG, "Échec connexion", error.message);
      throw new Error(translateAuthError(error.message));
    }

    const userId = data.user?.id;
    if (!userId) throw new Error("Session invalide après connexion.");

    const profile = await fetchProfile(userId);
    if (!profile) {
      throw new Error("Profil introuvable. Contactez le support.");
    }
    return profile;
  },

  /**
   * Déconnexion réelle.
   */
  async signOut(): Promise<void> {
    const { error } = await getSupabase().auth.signOut();
    if (error) {
      logger.warn(TAG, "Échec déconnexion", error.message);
      throw new Error("Impossible de se déconnecter.");
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
