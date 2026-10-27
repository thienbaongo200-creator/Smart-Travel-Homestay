import { AuthProvider } from "../hooks/useAuth.jsx";

export default function AppProviders({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
