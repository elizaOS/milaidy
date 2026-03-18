import { Route, Routes } from "react-router-dom";
import { Homepage } from "./App";
import { Dashboard } from "./components/dashboard/Dashboard";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
