import { Redirect } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { useLicense } from "../contexts/LicenseContext";

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const { gate } = useLicense();

  if (isLoading) return null;

  if (isAuthenticated) {
    // La licence contrôle l'accès : si elle n'est pas OK, afficher l'écran
    // de licence (expirée / suspendue / vérification impossible).
    if (gate.status !== "ok" && gate.status !== "checking") {
      return <Redirect href="/license" />;
    }
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  return <Redirect href="/(public)/splash" />;
}
