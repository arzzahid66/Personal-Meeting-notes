import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { InstallPrompt } from "@/components/InstallPrompt";
import { RequireAuth, RequireAnon } from "@/components/guards";
import LoginScreen from "@/routes/Login";
import SignupScreen from "@/routes/Signup";
import MeetingsScreen from "@/routes/Meetings";
import MeetingDetailScreen from "@/routes/MeetingDetail";
import NewMeetingScreen from "@/routes/NewMeeting";
import RecordScreen from "@/routes/Record";
import LiveScreen from "@/routes/Live";
import ProjectsScreen from "@/routes/Projects";
import ProjectDetailScreen from "@/routes/ProjectDetail";
import TasksScreen from "@/routes/Tasks";
import SettingsScreen from "@/routes/Settings";
import TokensScreen from "@/routes/Tokens";
import NotFoundScreen from "@/routes/NotFound";

export default function App() {
  return (
    <>
    {/* Above the router so it is in the flow at the top of every screen, the
        login screen included, rather than floating over the page. */}
    <InstallPrompt />
    <Routes>
      <Route element={<RequireAnon />}>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/signup" element={<SignupScreen />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/meetings" replace />} />
          <Route path="/meetings" element={<MeetingsScreen />} />
          <Route path="/meetings/new" element={<NewMeetingScreen />} />
          <Route path="/meetings/:id" element={<MeetingDetailScreen />} />
          <Route path="/record" element={<RecordScreen />} />
          <Route path="/live" element={<LiveScreen />} />
          <Route path="/projects" element={<ProjectsScreen />} />
          <Route path="/projects/:id" element={<ProjectDetailScreen />} />
          <Route path="/tasks" element={<TasksScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/settings/tokens" element={<TokensScreen />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
    </>
  );
}
