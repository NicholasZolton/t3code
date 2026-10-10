package expo.modules.t3agentnotifications

import android.app.Notification
import androidx.lifecycle.Lifecycle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [24, 26, 33, 36], manifest = Config.NONE)
class PairedAgentNotificationsTest : AgentNotificationFixture() {
  private fun pairedAlert(id: String = "opaque-notice"): Map<String, String> = mapOf(
    "registration_id" to "opaque-registration",
    "notification_id" to id,
    "phase" to "completed",
    "updated_at" to System.currentTimeMillis().toString()
  )

  @Test
  fun pairedAlertUsesGenericTextAndAnOpaqueTapRoute() {
    AgentNotifications.configurePaired(context, listOf("opaque-registration"), "t3code-dev")
    AgentNotifications.receivePaired(context, pairedAlert())
    val notification = manager.activeNotifications.single().notification
    assertEquals("T3 Code", notification.extras.getString(Notification.EXTRA_TITLE))
    assertEquals("An agent finished.", notification.extras.getString(Notification.EXTRA_TEXT))
    val intent = shadowOf(notification.contentIntent).savedIntent
    assertEquals(
      "t3code-dev://notifications/opaque-registration/opaque-notice",
      intent.data.toString()
    )
  }

  @Test
  fun pairedAlertsSurviveConnectSignOutAndDoNotRepeat() {
    AgentNotifications.configurePaired(context, listOf("opaque-registration"), "t3code-dev")
    AgentNotifications.clear(context)
    AgentNotifications.receivePaired(context, pairedAlert())
    AgentNotifications.receivePaired(context, pairedAlert())
    assertEquals(1, manager.activeNotifications.size)
  }

  @Test
  fun disablingPairedNotificationsClearsAlertsAndBlocksNewDelivery() {
    AgentNotifications.configurePaired(context, listOf("opaque-registration"), "t3code-dev")
    AgentNotifications.receivePaired(context, pairedAlert())
    AgentNotifications.configurePaired(context, emptyList(), "t3code-dev")
    AgentNotifications.receivePaired(context, pairedAlert("another"))
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun pairedReceiverRejectsUnknownRegistrationsExpiredMessagesAndMissingPermission() {
    AgentNotifications.receivePaired(context, pairedAlert())
    assertTrue(manager.activeNotifications.isEmpty())
    AgentNotifications.configurePaired(context, listOf("opaque-registration"), "t3code-dev")
    AgentNotifications.receivePaired(
      context,
      pairedAlert() + ("updated_at" to (System.currentTimeMillis() - 3_600_000).toString())
    )
    assertTrue(manager.activeNotifications.isEmpty())
    shadowOf(manager).setNotificationsEnabled(false)
    AgentNotifications.receivePaired(context, pairedAlert())
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun pairedActivityUsesRichPresentationAndSurvivesConnectSignOutWithoutRearmingDismissal() {
    AgentNotifications.configurePaired(context, listOf("paired"), "t3code-dev")
    val data = update("paired-alert", true) + mapOf(
      "activity_phase" to "waiting_for_input",
      "activity_active_count" to "1",
      "activity_line_0" to "Input\tChoose an icon\tPrivate project"
    )
    AgentNotifications.receivePairedActivity(context, "paired", data)
    val card = manager.activeNotifications.single { it.tag == "t3-agent-activity" }.notification
    assertEquals("Choose an icon", card.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
    assertEquals("Answer", card.actions.first().title.toString())
    assertEquals(
      "t3code-dev://threads/environment/thread",
      shadowOf(card.contentIntent).savedIntent.dataString
    )
    AgentNotifications.dismiss(context)
    AgentNotifications.clear(context)
    AgentNotifications.receivePairedActivity(context, "paired", data)
    assertEquals("t3-paired-alert:paired", manager.activeNotifications.single().tag)
  }

  @Test
  fun pairedForegroundSuppressionConsumesRetriesWithoutSuppressingActivity() {
    AgentNotifications.configurePaired(context, listOf("paired"), "t3code-dev")
    lifecycle.currentState = Lifecycle.State.RESUMED
    val data = update("paired-alert", true)
    AgentNotifications.receivePairedActivity(context, "paired", data)
    lifecycle.currentState = Lifecycle.State.CREATED
    AgentNotifications.receivePairedActivity(context, "paired", data)
    assertEquals("t3-agent-activity", manager.activeNotifications.single().tag)
  }

  @Test
  fun independentPairedEnvironmentsMergeByPriorityAndExpireWithoutClearingOtherWork() {
    AgentNotifications.configurePaired(context, listOf("work", "input"), "t3code-dev")
    val now = System.currentTimeMillis()
    AgentNotifications.receivePairedActivity(
      context,
      "work",
      update("work", true) - "alert_id" + mapOf(
        "activity_phase" to "running",
        "activity_active_count" to "2",
        "activity_line_0" to "Working\tFirst task\tFirst project",
        "activity_expires_at" to (now + 7_200_000).toString()
      )
    )
    AgentNotifications.receivePairedActivity(
      context,
      "input",
      update("input", true) - "alert_id" + mapOf(
        "updated_at" to (now - 1000).toString(),
        "activity_phase" to "waiting_for_input",
        "activity_active_count" to "1",
        "activity_attention_count" to "1",
        "activity_line_0" to "Input\tSecond task\tSecond project",
        "activity_path" to "/threads/other/second",
        "activity_expires_at" to (now + 900_000).toString()
      )
    )
    val card = manager.activeNotifications.single().notification
    assertEquals("1 needs you", card.extras.getCharSequence(Notification.EXTRA_TITLE).toString())
    assertEquals("3 active", card.extras.getString(Notification.EXTRA_SUB_TEXT))
    assertEquals(
      "Input Second task · Second project\nWorking First task · First project",
      card.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString()
    )
    assertEquals(
      "t3code-dev://threads/other/second",
      shadowOf(card.contentIntent).savedIntent.dataString
    )
    AgentNotifications.expire(context, now + 900_001)
    val remaining = manager.activeNotifications.single().notification
    assertEquals(
      "First task",
      remaining.extras.getCharSequence(Notification.EXTRA_TITLE).toString()
    )
    AgentNotifications.configurePaired(context, listOf("work"), "t3code-dev")
    AgentNotifications.receivePairedActivity(context, "input", update("removed", true))
    assertEquals(1, manager.activeNotifications.size)
  }

  @Test
  fun pairedOptOutRemovesOnlyItsAlertsAndActivityAndOngoingCanBeReenabled() {
    AgentNotifications.configurePaired(context, listOf("first", "second"), "t3code-dev")
    AgentNotifications.receivePairedActivity(context, "first", update("first", true))
    AgentNotifications.receivePairedActivity(context, "second", update("second", true))
    AgentNotifications.configurePaired(context, listOf("second"), "t3code-dev", false)
    assertEquals("t3-paired-alert:second", manager.activeNotifications.single().tag)
    AgentNotifications.configurePaired(context, listOf("second"), "t3code-dev", true)
    assertEquals(2, manager.activeNotifications.size)
    AgentNotifications.configurePaired(context, emptyList(), "t3code-dev")
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test
  fun pairedOrderingRejectsOlderCardsButRetainsIndependentAlerts() {
    AgentNotifications.configurePaired(context, listOf("paired"), "t3code-dev")
    val now = System.currentTimeMillis()
    AgentNotifications.receivePairedActivity(
      context,
      "paired",
      update("new", true) + ("updated_at" to now.toString())
    )
    AgentNotifications.receivePairedActivity(
      context,
      "paired",
      update("older", false) + ("updated_at" to (now - 1000).toString())
    )
    assertEquals(1, manager.activeNotifications.count { it.tag == "t3-agent-activity" })
    assertEquals(2, manager.activeNotifications.count { it.tag == "t3-paired-alert:paired" })
  }
}
