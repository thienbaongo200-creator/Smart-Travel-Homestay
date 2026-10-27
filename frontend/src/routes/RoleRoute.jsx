import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import LoadingState from "../components/common/LoadingState.jsx";

const HOME_BY_ROLE = {
  ADMIN: "/admin",
  HOST: "/host",
  VEHICLE_OWNER: "/host",
  CUSTOMER: "/",
};

export function roleHome(role) {
  return HOME_BY_ROLE[role] ?? "/";
}

export default function RoleRoute({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <LoadingState />;
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  if (!roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}
