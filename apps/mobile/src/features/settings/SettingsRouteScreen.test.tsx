import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import type { AppBarMenu } from "../../components/ui/AppBar.types";

const { Children, harness } = vi.hoisted(
  (): {
    Children: (props: { children?: ReactNode }) => ReactNode;
    harness: { cloudConfigured: boolean };
  } => ({
    Children: ({ children }) => children,
    harness: { cloudConfigured: false },
  }),
);

vi.mock("react-native", () => ({ View: Children, Platform: { OS: "ios" } }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useUser: () => ({ user: null }),
}));
vi.mock("@react-navigation/native", () => ({ useNavigation: () => ({}) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("../cloud/publicConfig", () => ({ hasCloudPublicConfig: () => harness.cloudConfigured }));
vi.mock("../workspace/navigation-tab-order", () => ({
  navigationCustomizationAvailable: () => false,
  overflowNavigationTabs: () => [],
}));
vi.mock("../workspace/navigation-tabs", () => ({
  NAVIGATION_TAB_ICONS: {},
  WORKSPACE_TAB_LABELS: {},
  useNavigationTabOrder: () => [],
  useHiddenNavigationTabs: () => [],
}));
vi.mock("../workspace/workspace-selection-store", () => ({
  currentWorkspaceSelections: () => ({}),
}));
vi.mock("../workspace/workspace-tab-navigation", () => ({ rememberedSettingsPage: () => null }));
vi.mock("../workspace/useSelectWorkspaceTab", () => ({ useSelectWorkspaceTab: () => vi.fn() }));
vi.mock("../workspace/WorkspaceTabsContext", () => ({ useWorkspaceTabs: () => null }));
vi.mock("../workspace/useWorkspaceSurface", () => ({
  useWorkspaceSurface: () => ({ className: "bg-screen" }),
}));
vi.mock("../layout/adaptive-workspace-context", () => ({
  useAdaptiveWorkspaceLayout: () => ({ layout: { usesSplitView: false } }),
}));
vi.mock("../../native/native-layout-metrics", () => ({ useNativeColumnLayoutMetrics: () => null }));
vi.mock("../../native/v5-workspace-context", async () => {
  const { createContext } = await import("react");
  return { NativePrimaryColumnContext: createContext(null) };
});
vi.mock("../../state/use-remote-environment-registry", () => ({
  useSavedRemoteConnections: () => ({ savedConnectionsById: {} }),
}));
vi.mock("../../components/ui/ScreenScrollView", () => ({ ScreenScrollView: Children }));
vi.mock("../../components/ui/EmptyState", () => ({ EmptyState: () => null }));
vi.mock("./components/SettingsScreen", () => ({ SettingsScreen: Children }));
vi.mock("./components/SettingsSection", async () => {
  const { createContext } = await import("react");
  return { SettingsSection: Children, SettingsSidebarContext: createContext(null) };
});
vi.mock("./components/SettingsEnvironmentFilterHeader", () => ({
  SettingsEnvironmentFilterHeader: () => null,
  useSettingsEnvironmentMenu: (): AppBarMenu => ({
    title: "Environments",
    icon: "line.3.horizontal.decrease.circle",
    items: [],
  }),
}));
vi.mock("./components/SettingsRow", () => ({
  SettingsRow: ({ label }: { label: string }) => <button>{label}</button>,
}));
vi.mock("./settings-environment-filter", () => ({
  useSettingsEnvironmentFilter: () => ({
    selectedTargets: [],
    projectGroups: [],
    selectedProjectKey: null,
  }),
}));

import { SettingsListScreen } from "./SettingsRouteScreen";

interface TestScreen extends Disposable {
  readonly container: HTMLDivElement;
}

function renderSettings(): TestScreen {
  const container: HTMLDivElement = document.createElement("div");
  const root: Root = createRoot(container);
  try {
    act(() => root.render(<SettingsListScreen sidebar={false} selected={null} />));
    return { container, [Symbol.dispose]: () => act(() => root.unmount()) };
  } catch (error) {
    act(() => root.unmount());
    throw error;
  }
}

it.each([false, true])("shows notification settings with cloudConfigured=%s", (cloudConfigured) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  harness.cloudConfigured = cloudConfigured;
  using screen = renderSettings();
  const notifications: HTMLButtonElement[] = Array.from(
    screen.container.querySelectorAll("button"),
  ).filter((button) => button.textContent === "Notifications");
  expect(notifications).toHaveLength(1);
});
