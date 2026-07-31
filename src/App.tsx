import { useEffect, useState } from "react";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { fetchAuthSession } from "aws-amplify/auth";
import CoachDashboard from "./components/CoachDashboard";
import AthleteCalendar from "./components/AthleteCalendar";

type Role = "coach" | "athlete" | "unassigned" | "loading";

function Shell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuthenticator((ctx) => [ctx.user]);
  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="wordmark">
          <span className="bug" />
          Training Tracker
        </div>
        <div className="who">
          {user?.signInDetails?.loginId}
          <button type="button" className="btn-text" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function RoleRouter() {
  const [role, setRole] = useState<Role>("loading");

  useEffect(() => {
    (async () => {
      try {
        const session = await fetchAuthSession();
        const groups =
          (session.tokens?.accessToken.payload["cognito:groups"] as
            | string[]
            | undefined) ?? [];
        if (groups.includes("Coaches")) setRole("coach");
        else if (groups.includes("Athletes")) setRole("athlete");
        else setRole("unassigned");
      } catch {
        setRole("unassigned");
      }
    })();
  }, []);

  if (role === "loading") {
    return <div className="empty-state">Loading your account…</div>;
  }

  if (role === "unassigned") {
    return (
      <div className="empty-state">
        <h2 style={{ marginBottom: 8 }}>Almost there</h2>
        <p>
          Your account isn't linked to a coach or athlete role yet. Ask your
          coach to add you in the Cognito console (Groups → Athletes), or if
          this is your coach account, add yourself to the Coaches group.
        </p>
      </div>
    );
  }

  return role === "coach" ? <CoachDashboard /> : <AthleteCalendar />;
}

export default function App() {
  return (
    <Authenticator>
      <Shell>
        <RoleRouter />
      </Shell>
    </Authenticator>
  );
}
