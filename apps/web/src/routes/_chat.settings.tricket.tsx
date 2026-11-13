import { createFileRoute } from "@tanstack/react-router";
import { TricketSettingsPage } from "../components/settings/tricket/TricketSettingsPage";

export const Route = createFileRoute("/_chat/settings/tricket")({ component: TricketSettingsPage });
