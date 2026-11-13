import { useAtomValue } from "@effect/atom-react";
import {
  TRICKET_WEBHOOK_PATH,
  type EnvironmentId,
  type TricketSettings,
  type TricketState,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { hostedThreadLink } from "@t3tools/shared/threadLinks";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";

import { getCustomModelOptionsByInstance } from "../../../modelSelection";
import { providerInstanceEntriesFor } from "../../../providerInstances";
import { useProjects } from "../../../state/entities";
import { useEnvironmentProviders } from "../../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../../state/server";
import { tricketEnvironment } from "../../../state/tricket";
import { useAtomCommand } from "../../../state/use-atom-command";
import { ProviderModelPicker } from "../../chat/ProviderModelPicker";
import { runtimeModeConfig, runtimeModeOptions } from "../../chat/runtimeModeConfig";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { SecretInput } from "../SecretInput";
import { useSettingsScope } from "../SettingsScopeContext";
import { useScopedSettings } from "../useScopedSettings";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "../settingsLayout";

function Field({ children }: { readonly children: ReactNode }): ReactNode {
  return <div className="w-full sm:w-80">{children}</div>;
}

export function TricketSettingsPage(): ReactNode {
  const { environment } = useSettingsScope();
  if (environment?.serverConfig?.environment.capabilities.tricketIntegration !== true)
    return (
      <SettingsPageContainer>
        <p className="text-sm text-muted-foreground">
          Choose an environment with Tricket support, or update its server.
        </p>
      </SettingsPageContainer>
    );
  return (
    <SettingsPageContainer>
      {environment ? (
        <TricketForm key={environment.environmentId} environmentId={environment.environmentId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose a connected environment to configure Tricket.
        </p>
      )}
    </SettingsPageContainer>
  );
}

function TricketForm({ environmentId }: { readonly environmentId: EnvironmentId }): ReactNode {
  const { environment } = useSettingsScope();
  const providersByEnvironment = useEnvironmentProviders();
  const scopedSettings = useScopedSettings();
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const canEdit = useAtomValue(tricketEnvironment.update.permissionAtom(environmentId));
  const get = useAtomCommand(tricketEnvironment.get, { reportFailure: false });
  const update = useAtomCommand(tricketEnvironment.update, { reportFailure: false });
  const [snapshot, setSnapshot] = useState<TricketState | null>(null);
  const [draft, setDraft] = useState<Partial<TricketSettings>>({});
  const [adminToken, setAdminToken] = useState<string | null | undefined>(undefined);
  const [signingSecret, setSigningSecret] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useEffectEvent(async (current: () => boolean): Promise<void> => {
    const result = await get({ environmentId, input: {} });
    if (!current()) return;
    if (result._tag === "Success") setSnapshot(result.value);
    else
      setMessage(
        "Tricket settings are unavailable. Check your permissions and update this environment if needed.",
      );
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads integration state from the selected environment, ignoring replies after navigation
  useEffect(() => {
    let current = true;
    // oxlint-disable-next-line react/set-state-in-effect -- State changes only after the environment replies.
    void load(() => current);
    return () => {
      current = false;
    };
  }, []);

  if (snapshot === null)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {message ?? "Loading Tricket settings…"}
      </p>
    );
  const values: TricketSettings = { ...snapshot.settings, ...draft };
  const serverSettings = environment?.serverConfig?.settings;
  const providers = providersByEnvironment.get(environmentId) ?? EMPTY_SERVER_PROVIDERS;
  const entries = serverSettings
    ? providerInstanceEntriesFor(providers, serverSettings, values.projectId)
    : [];
  const activeInstanceId = values.modelSelection?.instanceId ?? entries[0]?.instanceId;
  const models = serverSettings
    ? getCustomModelOptionsByInstance(
        scopedSettings,
        providers,
        activeInstanceId,
        values.modelSelection?.model,
      )
    : new Map();
  const frozenConnection =
    snapshot.settings.enabled || snapshot.handoffs.some((handoff) => handoff.status !== "stopped");
  const disabled = busy || !canEdit;

  const save = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const result = await update({
      environmentId,
      input: {
        settings: values,
        ...(adminToken === undefined ? {} : { adminToken }),
        ...(signingSecret === undefined ? {} : { signingSecret }),
      },
    });
    setBusy(false);
    if (result._tag !== "Success") {
      setMessage(
        "Could not save. Complete the configuration before enabling; disable and save before changing the connection or repository.",
      );
      return;
    }
    setSnapshot(result.value);
    setDraft({});
    setAdminToken(undefined);
    setSigningSecret(undefined);
    setMessage("Saved on this environment.");
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="px-3 text-sm text-muted-foreground sm:px-4">
        Tricket assigns the work. {environment?.label ?? "This environment"} runs the agents, even
        when this client is closed.
      </p>
      <SettingsSection id="tricket" title="Connection">
        <SettingsRow
          title="Run Tricket assignments"
          description="Saving with this enabled starts ready tickets from the mapped project. Disabling stops managed threads and their delegated work without reassigning tickets."
          control={
            <Switch
              aria-label="Run Tricket assignments"
              checked={values.enabled}
              disabled={disabled}
              onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
            />
          }
        />
        <SettingsRow
          title="Tricket address"
          description={
            frozenConnection
              ? "Disable and save before changing the connection or repository."
              : "The origin of your Tricket API, reachable from this environment."
          }
          control={
            <Field>
              <Input
                aria-label="Tricket address"
                type="url"
                placeholder="https://tricket.example.com"
                value={values.apiUrl}
                disabled={disabled || frozenConnection}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, apiUrl: event.target.value }))
                }
              />
            </Field>
          }
        />
        <SettingsRow
          title="Administrator token"
          description="Used only by the server to provision separate thread credentials. Never sent to an agent."
          resetAction={
            snapshot.hasAdminToken ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled || values.enabled}
                onClick={() => setAdminToken(null)}
              >
                Clear
              </Button>
            ) : null
          }
          control={
            <Field>
              <SecretInput
                aria-label="Tricket administrator token"
                configured={snapshot.hasAdminToken && adminToken !== null}
                value={adminToken ?? ""}
                disabled={disabled}
                onChange={(event) => setAdminToken(event.target.value || undefined)}
              />
            </Field>
          }
        />
        <SettingsRow
          title="Webhook signing secret"
          description="The whsec_ key returned when you create a Tricket webhook subscription."
          resetAction={
            snapshot.hasSigningSecret ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled || values.enabled}
                onClick={() => setSigningSecret(null)}
              >
                Clear
              </Button>
            ) : null
          }
          control={
            <Field>
              <SecretInput
                aria-label="Tricket webhook signing secret"
                configured={snapshot.hasSigningSecret && signingSecret !== null}
                value={signingSecret ?? ""}
                disabled={disabled}
                onChange={(event) => setSigningSecret(event.target.value || undefined)}
              />
            </Field>
          }
        />
        <SettingsRow
          title="Webhook receiver"
          description="Append this path to this environment's private origin. Subscribe to issue.* events. The Tricket server must allow that origin and be able to reach it."
          control={<code className="break-all text-xs">{TRICKET_WEBHOOK_PATH}</code>}
        />
      </SettingsSection>
      <SettingsSection title="Repository and workers">
        <SettingsRow
          title="Tricket project ID"
          description="Only ready pool tickets in this project can start work."
          control={
            <Field>
              <Input
                aria-label="Tricket project ID"
                placeholder="Project UUID"
                value={values.tricketProjectId}
                disabled={disabled || frozenConnection}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, tricketProjectId: event.target.value }))
                }
              />
            </Field>
          }
        />
        <SettingsRow
          title="Repository on this environment"
          description="Each handoff gets a new thread and isolated worktree here, never on the client."
          control={
            <Field>
              <Select
                value={values.projectId ?? ""}
                disabled={disabled || frozenConnection}
                onValueChange={(id) => {
                  const project = projects.find((candidate) => candidate.id === id);
                  if (project) setDraft((current) => ({ ...current, projectId: project.id }));
                }}
              >
                <SelectTrigger aria-label="Tricket repository">
                  <SelectValue placeholder="Choose a repository">
                    {projects.find((project) => project.id === values.projectId)?.title ??
                      "Choose a repository"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
          }
        />
        <SettingsRow
          title="Base ref"
          description="New worktrees start from this repository ref. Existing handoffs keep their original configuration."
          control={
            <Field>
              <Input
                aria-label="Tricket base ref"
                value={values.baseRef}
                disabled={disabled}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, baseRef: event.target.value }))
                }
              />
            </Field>
          }
        />
        <SettingsRow
          title="Worker model"
          description="Choose explicitly. Tricket does not select a provider or spend on one by default."
          control={
            activeInstanceId ? (
              <ProviderModelPicker
                environmentId={environmentId}
                activeInstanceId={activeInstanceId}
                model={values.modelSelection?.model ?? ""}
                lockedProvider={null}
                instanceEntries={entries}
                modelOptionsByInstance={models}
                isComposerOwned={false}
                disabled={disabled}
                {...(values.modelSelection === null ? { triggerLabel: "Choose model" } : {})}
                triggerAriaLabel="Tricket worker model"
                onInstanceModelChange={(instanceId, model) =>
                  setDraft((current) => ({
                    ...current,
                    modelSelection: createModelSelection(instanceId, model),
                  }))
                }
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                Configure a provider on this environment first.
              </span>
            )
          }
        />
        <SettingsRow
          title="Permissions"
          description="Applies to new handoffs. Approvals, when required, remain available in the thread."
          control={
            <Select
              value={values.runtimeMode}
              disabled={disabled}
              onValueChange={(mode) => {
                const option = runtimeModeOptions.find((candidate) => candidate === mode);
                if (option) setDraft((current) => ({ ...current, runtimeMode: option }));
              }}
            >
              <SelectTrigger aria-label="Tricket worker permissions">
                <SelectValue>{runtimeModeConfig[values.runtimeMode].label}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {runtimeModeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {runtimeModeConfig[option].label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          title="Worker slots"
          description="Tickets awaiting review release their slot. An ended turn alone does not release ownership or complete a ticket."
          control={
            <div className="w-24">
              <Input
                aria-label="Tricket worker slots"
                type="number"
                min={1}
                max={8}
                value={values.maxWorkers}
                disabled={disabled}
                onChange={(event) => {
                  const maxWorkers = event.target.valueAsNumber;
                  if (Number.isInteger(maxWorkers) && maxWorkers >= 1 && maxWorkers <= 8)
                    setDraft((current) => ({ ...current, maxWorkers }));
                }}
              />
            </div>
          }
        />
      </SettingsSection>
      <div className="flex items-center gap-3 px-3 sm:px-4">
        <Button type="submit" disabled={disabled}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {message ? (
          <p className="text-sm text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}
      </div>
      <SettingsSection
        title="Activity"
        headerAction={
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void load(() => true)}>
            Refresh
          </Button>
        }
      >
        <SettingsRow
          title={snapshot.settings.enabled ? "Enabled" : "Disabled"}
          description={`${snapshot.pendingDeliveries} pending deliveries. Reconciliation also recovers current assignments after a restart.`}
          status={snapshot.lastError}
        />
        {snapshot.handoffs.length === 0 ? (
          <SettingsRow
            title="No managed assignments yet"
            description="After configuration, assign an eligible ticket in the mapped project to the T3 pool."
          />
        ) : (
          snapshot.handoffs.map((handoff) => (
            <SettingsRow
              key={handoff.threadId}
              title={
                <a
                  className="underline underline-offset-4"
                  href={hostedThreadLink({ environmentId, threadId: handoff.threadId })}
                >
                  {handoff.identifier}
                </a>
              }
              control={<span className="text-sm text-muted-foreground">{handoff.status}</span>}
            />
          ))
        )}
      </SettingsSection>
    </form>
  );
}
