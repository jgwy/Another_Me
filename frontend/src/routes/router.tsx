import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "../components/layout/AppShell";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { IslandPage } from "../features/island/IslandPage";
import { PlazaPage } from "../features/plaza/PlazaPage";
import { AgentsPage } from "../features/agents/AgentsPage";
import { AgentDetailPage } from "../features/agents/AgentDetailPage";
import { CreateAgentPage } from "../features/create-agent/CreateAgentPage";
import { DispatchPage } from "../features/dispatch/DispatchPage";
import { ConversationsPage } from "../features/conversation/ConversationsPage";
import { SpectatePage } from "../features/conversation/SpectatePage";
import { ReportPage } from "../features/reports/ReportPage";
import { ReportByIdPage } from "../features/reports/ReportByIdPage";
import { MarketplacePage } from "../features/marketplace/MarketplacePage";
import { CreateScenarioPage } from "../features/scenarios/CreateScenarioPage";
import { InboxPage } from "../features/inbox/InboxPage";
import { RelationshipsPage } from "../features/relationships/RelationshipsPage";
import { SandboxPage } from "../features/sandbox/SandboxPage";
import { TripDetailPage } from "../features/trips/TripDetailPage";
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
      { path: "plaza/:scenarioId", element: <PlazaPage /> },
      { path: "scenarios/new", element: <CreateScenarioPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "agents/new", element: <CreateAgentPage /> },
      { path: "agents/:id", element: <AgentDetailPage /> },
      { path: "dispatch", element: <DispatchPage /> },
      { path: "trips/:id", element: <TripDetailPage /> },
      { path: "conversations", element: <ConversationsPage /> },
      { path: "conversations/:id", element: <SpectatePage /> },
      { path: "conversations/:id/report", element: <ReportPage /> },
      { path: "reports/:id", element: <ReportByIdPage /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "relationships", element: <RelationshipsPage /> },
      { path: "sandbox", element: <SandboxPage /> },
      { path: "marketplace", element: <MarketplacePage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
