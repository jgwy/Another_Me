import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { IslandPage } from "../features/island/IslandPage";
import { AgentsPage } from "../features/agents/AgentsPage";
import { AgentDetailPage } from "../features/agents/AgentDetailPage";
import { CreateAgentPage } from "../features/create-agent/CreateAgentPage";
import { DispatchPage } from "../features/dispatch/DispatchPage";
import { ConversationsPage } from "../features/conversation/ConversationsPage";
import { SpectatePage } from "../features/conversation/SpectatePage";
import { ReportPage } from "../features/reports/ReportPage";
import { MarketplacePage } from "../features/marketplace/MarketplacePage";
import { useAuthStore } from "../store/auth";

/** Gate authenticated areas; redirect to /login when there is no session. */
function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <AppShell />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      { index: true, element: <IslandPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "agents/new", element: <CreateAgentPage /> },
      { path: "agents/:id", element: <AgentDetailPage /> },
      { path: "dispatch", element: <DispatchPage /> },
      { path: "conversations", element: <ConversationsPage /> },
      { path: "conversations/:id", element: <SpectatePage /> },
      { path: "conversations/:id/report", element: <ReportPage /> },
      { path: "marketplace", element: <MarketplacePage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
