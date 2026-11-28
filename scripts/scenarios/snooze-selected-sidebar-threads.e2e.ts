import { expect } from "e2e";

import { test, WEB } from "./t3.ts";

test(
  "A sidebar snooze preset applies to the Shift-selected range",
  WEB,
  async ({ t3, app, browser, screen }) => {
    const project = await t3.project("Inbox");
    const thread = (title: string) => t3.thread({ project, title, messages: ["Ready for review"] });
    await thread("Next task");
    const first = await thread("Review onboarding");
    await thread("Polish empty states");
    await thread("Update release notes");
    await t3.open(first);

    const lastRow = screen.getByRole("button", /^Update release notes,/);
    await browser.keyboard.down("Shift");
    await lastRow.tap();
    await browser.keyboard.up("Shift");
    await lastRow.hover();
    await lastRow.getByRole("button", /^Snooze/).tap();
    await screen.getByRole("menuitem", /^In 1 hour/).tap();

    await app.screenshot("after-snooze");
    await expect(screen.getByRole("button", "Snoozed 3")).toBeVisible();
    await expect(screen.getByRole("heading", "Next task")).toBeVisible();
  },
);
