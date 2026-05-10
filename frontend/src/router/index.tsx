// src/router/index.tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import LandingPage from "../App";
import AppPage from "../pages/AppPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/app",
    element: <AppPage />,
  },
]);

export default function Router() {
  return <RouterProvider router={router} />;
}
