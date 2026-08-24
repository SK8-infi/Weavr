import { useState } from "react";
import OnboardingFlow from "./views/OnboardingFlow";
import Dashboard from "./views/Dashboard";

export default function App() {
  const [isAuthenticated] = useState(false);

  return isAuthenticated ? <Dashboard /> : <OnboardingFlow />;
}
