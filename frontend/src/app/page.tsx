import { Dashboard } from "@/components/dashboard/Dashboard";

/**
 * Server component shell. All data is live and comes from the FastAPI
 * backend in the browser, so the dashboard itself is a client component.
 */
export default function HomePage() {
  return <Dashboard />;
}
