import { useEffect, useState } from "react";
import OnboardingFlow from "./views/OnboardingFlow";
import Dashboard from "./views/Dashboard";
import { invoke } from "./lib/tauri";

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    invoke("auth_check_session")
      .then((existingUser) => setUser(existingUser))
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return <div className="min-h-screen bg-canvas-50" />;
  }

  if (!user) {
    return <OnboardingFlow onAuthenticated={setUser} />;
  }

  return <Dashboard user={user} onSignedOut={() => setUser(null)} />;
}
